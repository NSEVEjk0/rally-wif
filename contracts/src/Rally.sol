// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IWIF {
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address owner, address recipient, uint256 amount) external returns (bool);
}

/// @notice Fixed-term community reservations paid in the official WIF token.
/// @dev Check-in is an onchain action, not proof of real-world delivery quality.
contract Rally {
    address public constant WIF = 0x5173b8eA6923c2d40267890D45C46a3480954773;
    address public constant BURN_SINK = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant CHAIN_ID = 4663;
    uint256 public constant FEE_BPS = 100; // 1% on completed booking volume only.
    uint256 public constant CHECKIN_GRACE = 15 minutes;
    uint256 public constant MAX_PRICE = 1_000_000 ether; // WIF has 18 decimals.

    enum Phase { Funding, Confirmed, Completed, Underfilled, Cancelled, MissedCheckIn }

    struct Params {
        uint128 price;
        uint16 minimum;
        uint16 capacity;
        uint64 deadline;
        uint64 startAt;
        uint64 endAt;
        uint64 parentRound;
        string metadata;
    }

    struct Round {
        address creator;
        uint128 price;
        uint128 bond;
        uint128 bonusPerSeat;
        uint16 minimum;
        uint16 capacity;
        uint16 seats;
        uint16 refunds;
        uint64 deadline;
        uint64 startAt;
        uint64 endAt;
        uint64 parentRound;
        Phase phase;
        bool checkedIn;
        bytes32 termsHash;
        bytes32 checkInHash;
        string metadata;
    }

    struct CreatorStats {
        uint64 created;
        uint64 completed;
        uint64 underfilled;
        uint64 cancelledEarly;
        uint64 cancelledConfirmed;
        uint64 missedCheckIn;
        uint256 completedVolume;
    }

    uint64 public nextRoundId = 1;
    uint256 public totalLiability;
    uint256 public burnOwed;
    mapping(uint64 => Round) private rounds;
    mapping(uint64 => mapping(address => bool)) public reserved;
    mapping(address => uint256) public credits;
    mapping(address => CreatorStats) public creatorStats;
    uint256 private entered = 1;

    error WrongChain();
    error InvalidToken();
    error InvalidTerms();
    error RoundNotFound();
    error WrongPhase();
    error DeadlineNotReached();
    error ReservationsClosed();
    error NotCreator();
    error CreatorCannotReserve();
    error AlreadyReserved();
    error NoReservation();
    error AtCapacity();
    error CheckInWindowClosed();
    error AlreadyCheckedIn();
    error NothingToClaim();
    error TokenTransferFailed();
    error NonstandardTokenTransfer();
    error Reentrant();

    event RoundCreated(uint64 indexed id, address indexed creator, uint64 indexed parentRound, bytes32 termsHash, uint256 bond);
    event SeatReserved(uint64 indexed id, address indexed participant, uint16 seats, uint256 paid);
    event SeatReleased(uint64 indexed id, address indexed participant, uint16 seats);
    event GroupConfirmed(uint64 indexed id, uint16 seats);
    event RoundUnderfilled(uint64 indexed id, uint16 seats);
    event HostCheckedIn(uint64 indexed id, bytes32 announcementHash);
    event RoundCompleted(uint64 indexed id, uint256 creatorCredit, uint256 sinkCredit);
    event RoundCancelled(uint64 indexed id, bool bondForfeited, uint256 bonusPerSeat);
    event HostMissedCheckIn(uint64 indexed id, uint256 bonusPerSeat);
    event Refunded(uint64 indexed id, address indexed participant, uint256 amount);
    event CreditClaimed(address indexed creator, uint256 amount);
    event SentToBurnSink(uint256 amount);

    modifier nonReentrant() {
        if (entered != 1) revert Reentrant();
        entered = 2;
        _;
        entered = 1;
    }

    constructor() {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (WIF.code.length == 0 || IWIF(WIF).decimals() != 18) revert InvalidToken();
    }

    function bondFor(uint128 price, uint16 minimum) public pure returns (uint256) {
        return uint256(price) * minimum / 2;
    }

    function createRound(Params calldata p) external nonReentrant returns (uint64 id) {
        if (p.price == 0 || p.price > MAX_PRICE || p.minimum < 2 || p.capacity > 100 || p.minimum > p.capacity
            || p.deadline < block.timestamp + 5 minutes || p.deadline > block.timestamp + 30 days
            || p.startAt < p.deadline + 30 minutes || p.startAt > block.timestamp + 45 days
            || p.endAt < p.startAt + 15 minutes || p.endAt > p.startAt + 8 hours
            || bytes(p.metadata).length == 0 || bytes(p.metadata).length > 1800) revert InvalidTerms();
        if (p.parentRound != 0 && _round(p.parentRound).creator != msg.sender) revert NotCreator();
        uint256 bond = bondFor(p.price, p.minimum);
        id = nextRoundId++;
        Round storage r = rounds[id];
        r.creator = msg.sender;
        r.price = p.price;
        r.bond = uint128(bond);
        r.minimum = p.minimum;
        r.capacity = p.capacity;
        r.deadline = p.deadline;
        r.startAt = p.startAt;
        r.endAt = p.endAt;
        r.parentRound = p.parentRound;
        r.metadata = p.metadata;
        r.termsHash = keccak256(abi.encode(CHAIN_ID, address(this), msg.sender, p.price, p.minimum, p.capacity,
            p.deadline, p.startAt, p.endAt, p.parentRound, keccak256(bytes(p.metadata)), FEE_BPS, CHECKIN_GRACE));
        creatorStats[msg.sender].created++;
        totalLiability += bond;
        _receive(msg.sender, bond);
        emit RoundCreated(id, msg.sender, p.parentRound, r.termsHash, bond);
    }

    function reserve(uint64 id) external nonReentrant {
        Round storage r = _round(id);
        if (r.phase != Phase.Funding || block.timestamp >= r.deadline) revert ReservationsClosed();
        if (msg.sender == r.creator) revert CreatorCannotReserve();
        if (reserved[id][msg.sender]) revert AlreadyReserved();
        if (r.seats >= r.capacity) revert AtCapacity();
        reserved[id][msg.sender] = true;
        r.seats++;
        totalLiability += r.price;
        _receive(msg.sender, r.price);
        emit SeatReserved(id, msg.sender, r.seats, r.price);
    }

    /// @notice Release a reservation before the published commitment deadline.
    function leave(uint64 id) external nonReentrant {
        Round storage r = _round(id);
        if (r.phase != Phase.Funding || block.timestamp >= r.deadline) revert ReservationsClosed();
        if (!reserved[id][msg.sender]) revert NoReservation();
        reserved[id][msg.sender] = false;
        r.seats--;
        totalLiability -= r.price;
        _send(msg.sender, r.price);
        emit SeatReleased(id, msg.sender, r.seats);
    }

    /// @notice Anyone can resolve the group threshold after the deadline.
    function resolve(uint64 id) external nonReentrant {
        _resolve(id, _round(id));
    }

    function checkIn(uint64 id, bytes32 announcementHash) external nonReentrant {
        Round storage r = _round(id);
        if (r.creator != msg.sender) revert NotCreator();
        if (r.phase == Phase.Funding) _resolve(id, r);
        if (r.phase != Phase.Confirmed) revert WrongPhase();
        if (r.checkedIn) revert AlreadyCheckedIn();
        if (block.timestamp < r.startAt - CHECKIN_GRACE || block.timestamp > r.startAt + CHECKIN_GRACE) revert CheckInWindowClosed();
        r.checkedIn = true;
        r.checkInHash = announcementHash;
        emit HostCheckedIn(id, announcementHash);
    }

    /// @notice Time and the recorded host check-in are the completion conditions.
    /// @dev This deliberately does not adjudicate the quality of an offchain session.
    function complete(uint64 id) external nonReentrant {
        Round storage r = _round(id);
        if (r.phase == Phase.Funding) _resolve(id, r);
        if (r.phase != Phase.Confirmed || !r.checkedIn || block.timestamp < r.endAt) revert WrongPhase();
        r.phase = Phase.Completed;
        uint256 gross = uint256(r.price) * r.seats;
        uint256 fee = gross * FEE_BPS / 10_000;
        uint256 payout = gross - fee + r.bond;
        credits[r.creator] += payout;
        burnOwed += fee;
        CreatorStats storage stats = creatorStats[r.creator];
        stats.completed++;
        stats.completedVolume += gross;
        emit RoundCompleted(id, payout, fee);
    }

    function cancel(uint64 id) external nonReentrant {
        Round storage r = _round(id);
        if (r.creator != msg.sender) revert NotCreator();
        if (r.phase == Phase.Funding && block.timestamp >= r.deadline) _resolve(id, r);
        bool penalized;
        if (r.phase == Phase.Funding) {
            r.phase = Phase.Cancelled;
            credits[r.creator] += r.bond;
            creatorStats[r.creator].cancelledEarly++;
        } else if (r.phase == Phase.Confirmed) {
            r.phase = Phase.Cancelled;
            _forfeit(r);
            creatorStats[r.creator].cancelledConfirmed++;
            penalized = true;
        } else {
            revert WrongPhase();
        }
        emit RoundCancelled(id, penalized, r.bonusPerSeat);
    }

    /// @notice The host cannot hold refunds hostage by never resolving/checking in.
    function refund(uint64 id) external nonReentrant {
        Round storage r = _round(id);
        if (r.phase == Phase.Funding) _resolve(id, r);
        if (r.phase == Phase.Confirmed && !r.checkedIn && block.timestamp > r.startAt + CHECKIN_GRACE) _missed(id, r);
        if (r.phase != Phase.Underfilled && r.phase != Phase.Cancelled && r.phase != Phase.MissedCheckIn) revert WrongPhase();
        if (!reserved[id][msg.sender]) revert NoReservation();
        reserved[id][msg.sender] = false;
        r.refunds++;
        uint256 amount = uint256(r.price) + r.bonusPerSeat;
        totalLiability -= amount;
        _send(msg.sender, amount);
        emit Refunded(id, msg.sender, amount);
    }

    function resolveMissedCheckIn(uint64 id) external nonReentrant {
        Round storage r = _round(id);
        if (r.phase == Phase.Funding) _resolve(id, r);
        _missed(id, r);
    }

    function claimCredit() external nonReentrant {
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NothingToClaim();
        credits[msg.sender] = 0;
        totalLiability -= amount;
        _send(msg.sender, amount);
        emit CreditClaimed(msg.sender, amount);
    }

    function flushBurnSink() external nonReentrant {
        uint256 amount = burnOwed;
        if (amount == 0) revert NothingToClaim();
        burnOwed = 0;
        totalLiability -= amount;
        _send(BURN_SINK, amount);
        emit SentToBurnSink(amount);
    }

    /// @notice Refunding a round never depends on a separately run keeper.
    function effectivePhase(uint64 id) external view returns (Phase) {
        Round storage r = _round(id);
        Phase phase = r.phase;
        if (phase == Phase.Funding && block.timestamp >= r.deadline) phase = r.seats < r.minimum ? Phase.Underfilled : Phase.Confirmed;
        if (phase == Phase.Confirmed && !r.checkedIn && block.timestamp > r.startAt + CHECKIN_GRACE) phase = Phase.MissedCheckIn;
        return phase;
    }

    function getRound(uint64 id) external view returns (Round memory) {
        return _round(id);
    }

    function refundable(uint64 id, address participant) external view returns (uint256) {
        Round storage r = _round(id);
        if (!reserved[id][participant]) return 0;
        if (r.phase == Phase.Underfilled || r.phase == Phase.Cancelled || r.phase == Phase.MissedCheckIn) return uint256(r.price) + r.bonusPerSeat;
        if (r.phase == Phase.Funding && block.timestamp >= r.deadline && r.seats < r.minimum) return r.price;
        if ((r.phase == Phase.Confirmed || (r.phase == Phase.Funding && block.timestamp >= r.deadline && r.seats >= r.minimum))
            && !r.checkedIn && block.timestamp > r.startAt + CHECKIN_GRACE) return uint256(r.price) + uint256(r.bond) / r.seats;
        return 0;
    }

    function _round(uint64 id) internal view returns (Round storage r) {
        r = rounds[id];
        if (r.creator == address(0)) revert RoundNotFound();
    }

    function _resolve(uint64 id, Round storage r) internal {
        if (r.phase != Phase.Funding) revert WrongPhase();
        if (block.timestamp < r.deadline) revert DeadlineNotReached();
        if (r.seats < r.minimum) {
            r.phase = Phase.Underfilled;
            credits[r.creator] += r.bond;
            creatorStats[r.creator].underfilled++;
            emit RoundUnderfilled(id, r.seats);
        } else {
            r.phase = Phase.Confirmed;
            emit GroupConfirmed(id, r.seats);
        }
    }

    function _forfeit(Round storage r) internal {
        r.bonusPerSeat = uint128(uint256(r.bond) / r.seats);
        burnOwed += uint256(r.bond) % r.seats;
    }

    function _missed(uint64 id, Round storage r) internal {
        if (r.phase != Phase.Confirmed || r.checkedIn || block.timestamp <= r.startAt + CHECKIN_GRACE) revert WrongPhase();
        r.phase = Phase.MissedCheckIn;
        _forfeit(r);
        creatorStats[r.creator].missedCheckIn++;
        emit HostMissedCheckIn(id, r.bonusPerSeat);
    }

    function _receive(address from, uint256 amount) internal {
        uint256 beforeBalance = IWIF(WIF).balanceOf(address(this));
        _call(abi.encodeCall(IWIF.transferFrom, (from, address(this), amount)));
        if (IWIF(WIF).balanceOf(address(this)) != beforeBalance + amount) revert NonstandardTokenTransfer();
    }

    function _send(address to, uint256 amount) internal {
        uint256 beforeBalance = IWIF(WIF).balanceOf(to);
        _call(abi.encodeCall(IWIF.transfer, (to, amount)));
        if (IWIF(WIF).balanceOf(to) != beforeBalance + amount) revert NonstandardTokenTransfer();
    }

    function _call(bytes memory data) internal {
        (bool ok, bytes memory returned) = WIF.call(data);
        if (!ok || (returned.length != 0 && (returned.length != 32 || !abi.decode(returned, (bool))))) revert TokenTransferFailed();
    }
}
