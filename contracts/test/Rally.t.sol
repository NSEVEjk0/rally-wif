// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Rally} from "../src/Rally.sol";

interface Vm {
    function chainId(uint256) external;
    function warp(uint256) external;
    function getBlockTimestamp() external view returns (uint256);
    function etch(address, bytes calldata) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
    function createSelectFork(string calldata) external returns (uint256);
    function envOr(string calldata, bool) external returns (bool);
    function load(address, bytes32) external view returns (bytes32);
    function store(address, bytes32, bytes32) external;
    function record() external;
    function accesses(address) external returns (bytes32[] memory, bytes32[] memory);
}

contract MockWIF {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failIncoming;
    bool public failOutgoing;
    bool public shortTransfer;
    address public attackTarget;
    bytes4 public attackError;
    function decimals() external pure returns (uint8) { return 18; }
    function mint(address who, uint256 amount) external { balanceOf[who] += amount; }
    function approve(address who, uint256 amount) external returns (bool) { allowance[msg.sender][who] = amount; return true; }
    function failures(bool incoming, bool outgoing, bool short_) external { failIncoming = incoming; failOutgoing = outgoing; shortTransfer = short_; }
    function attack(address target) external { attackTarget = target; }
    function transferFrom(address owner, address recipient, uint256 amount) external returns (bool) {
        if (failIncoming) return false;
        allowance[owner][msg.sender] -= amount;
        _transfer(owner, recipient, amount);
        _attack();
        return true;
    }
    function transfer(address recipient, uint256 amount) external returns (bool) {
        if (failOutgoing) return false;
        _transfer(msg.sender, recipient, amount);
        _attack();
        return true;
    }
    function _transfer(address owner, address recipient, uint256 amount) internal {
        balanceOf[owner] -= amount;
        balanceOf[recipient] += shortTransfer ? amount - 1 : amount;
    }
    function _attack() internal {
        if (attackTarget != address(0)) {
            (bool ok, bytes memory result) = attackTarget.call(abi.encodeWithSignature("flushBurnSink()"));
            require(!ok, "Reentry unexpectedly succeeded");
            if (result.length >= 4) attackError = bytes4(result);
        }
    }
}

contract WrongDecimals { function decimals() external pure returns (uint8) { return 6; } }

contract RallyTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant HOST = address(0x100);
    address internal constant ALICE = address(0x101);
    address internal constant BOB = address(0x102);
    address internal constant CAROL = address(0x103);
    Rally internal rally;
    MockWIF internal token;

    function setUp() public {
        vm.chainId(4663);
        vm.warp(1_793_836_800);
        MockWIF implementation = new MockWIF();
        vm.etch(0x5173b8eA6923c2d40267890D45C46a3480954773, address(implementation).code);
        token = MockWIF(0x5173b8eA6923c2d40267890D45C46a3480954773);
        rally = new Rally();
        _fund(HOST); _fund(ALICE); _fund(BOB); _fund(CAROL);
    }

    function _fund(address who) internal {
        token.mint(who, 1e30);
        vm.prank(who); token.approve(address(rally), type(uint256).max);
    }
    function _params(uint128 price, uint16 minimum, uint16 capacity) internal view returns (Rally.Params memory p) {
        p = Rally.Params(price, minimum, capacity, uint64(block.timestamp + 1 days),
            uint64(block.timestamp + 2 days), uint64(block.timestamp + 2 days + 1 hours), 0,
            '{"title":"Disclosed test session","format":"online"}');
    }
    function _create(uint128 price, uint16 minimum, uint16 capacity) internal returns (uint64 id) {
        vm.prank(HOST); id = rally.createRound(_params(price, minimum, capacity));
    }
    function _seat(uint64 id, address who) internal { vm.prank(who); rally.reserve(id); }
    function _confirm(uint64 id) internal {
        vm.warp(rally.getRound(id).deadline); rally.resolve(id);
    }
    function _same(uint256 a, uint256 b) internal pure { require(a == b, "Amounts differ"); }
    function _accounted() internal view { _same(token.balanceOf(address(rally)), rally.totalLiability()); }

    function testConstructorRejectsWrongChainAndToken() public {
        vm.chainId(46630); vm.expectRevert(Rally.WrongChain.selector); new Rally();
        vm.chainId(4663); vm.etch(address(token), "");
        vm.expectRevert(Rally.InvalidToken.selector); new Rally();
        WrongDecimals wrong = new WrongDecimals(); vm.etch(address(token), address(wrong).code);
        vm.expectRevert(Rally.InvalidToken.selector); new Rally();
    }

    function testFixedTermsCapacityAndWalletBoundaries() public {
        uint64 id = _create(10 ether, 2, 2);
        Rally.Round memory original = rally.getRound(id);
        _same(original.bond, 10 ether);
        require(original.termsHash != bytes32(0), "Missing terms hash");
        vm.prank(HOST); vm.expectRevert(Rally.CreatorCannotReserve.selector); rally.reserve(id);
        _seat(id, ALICE);
        vm.prank(ALICE); vm.expectRevert(Rally.AlreadyReserved.selector); rally.reserve(id);
        _seat(id, BOB);
        vm.prank(CAROL); vm.expectRevert(Rally.AtCapacity.selector); rally.reserve(id);
        vm.warp(original.deadline);
        vm.prank(ALICE); vm.expectRevert(Rally.ReservationsClosed.selector); rally.leave(id);
        require(rally.getRound(id).termsHash == original.termsHash, "Terms changed");
        _accounted();
    }

    function testLeaveIsFullRefundAndCanReserveAgain() public {
        uint64 id = _create(17 ether, 2, 5);
        uint256 before = token.balanceOf(ALICE);
        _seat(id, ALICE); vm.prank(ALICE); rally.leave(id);
        _same(token.balanceOf(ALICE), before);
        _same(rally.getRound(id).seats, 0);
        _seat(id, ALICE); _same(rally.getRound(id).seats, 1); _accounted();
    }

    function testUnderfilledDirectRefundResolvesWithoutHost() public {
        uint64 id = _create(9 ether, 3, 5);
        uint256 before = token.balanceOf(ALICE);
        _seat(id, ALICE);
        vm.expectRevert(Rally.DeadlineNotReached.selector); rally.resolve(id);
        vm.warp(rally.getRound(id).deadline);
        _same(rally.refundable(id, ALICE), 9 ether);
        vm.prank(ALICE); rally.refund(id);
        _same(token.balanceOf(ALICE), before);
        _same(rally.credits(HOST), 13.5 ether);
        vm.prank(ALICE); vm.expectRevert(Rally.NoReservation.selector); rally.refund(id);
        vm.prank(HOST); rally.claimCredit();
        _same(rally.totalLiability(), 0); _accounted();
    }

    function testNoParticipantsReturnsBond() public {
        uint64 id = _create(5 ether, 2, 10);
        vm.warp(rally.getRound(id).deadline); rally.resolve(id);
        vm.prank(HOST); rally.claimCredit();
        _same(rally.totalLiability(), 0); _accounted();
    }

    function testEarlyCancelReturnsSeatsAndCreatorBond() public {
        uint64 id = _create(20 ether, 2, 4);
        _seat(id, ALICE); _seat(id, BOB);
        vm.prank(HOST); rally.cancel(id);
        _same(rally.refundable(id, ALICE), 20 ether);
        vm.prank(ALICE); rally.refund(id);
        vm.prank(BOB); rally.refund(id);
        vm.prank(HOST); rally.claimCredit();
        _same(rally.totalLiability(), 0); _accounted();
    }

    function testConfirmedCancelSplitsBondAndDustIsAccounted() public {
        uint64 id = _create(5, 3, 3); // seven wei bond: two each, one sink.
        _seat(id, ALICE); _seat(id, BOB); _seat(id, CAROL); _confirm(id);
        vm.prank(HOST); rally.cancel(id);
        _same(rally.credits(HOST), 0); _same(rally.burnOwed(), 1);
        _same(rally.refundable(id, ALICE), 7);
        vm.prank(ALICE); rally.refund(id);
        vm.prank(BOB); rally.refund(id);
        vm.prank(CAROL); rally.refund(id);
        rally.flushBurnSink(); _same(token.balanceOf(rally.BURN_SINK()), 1);
        _same(rally.totalLiability(), 0); _accounted();
    }

    function testMissedCheckInDirectRefundEvenWithoutResolve() public {
        uint64 id = _create(10 ether, 2, 4);
        _seat(id, ALICE); _seat(id, BOB);
        vm.warp(rally.getRound(id).startAt + rally.CHECKIN_GRACE() + 1);
        _same(uint256(rally.effectivePhase(id)), uint256(Rally.Phase.MissedCheckIn));
        _same(rally.refundable(id, ALICE), 15 ether);
        vm.prank(ALICE); rally.refund(id);
        vm.prank(BOB); rally.refund(id);
        _same(rally.totalLiability(), 0); _accounted();
    }

    function testCheckInAndCompletionBoundary() public {
        uint64 id = _create(10 ether, 2, 4);
        _seat(id, ALICE); _seat(id, BOB);
        Rally.Round memory r = rally.getRound(id);
        vm.warp(r.startAt - rally.CHECKIN_GRACE() - 1);
        vm.prank(HOST); vm.expectRevert(Rally.CheckInWindowClosed.selector); rally.checkIn(id, keccak256("start"));
        vm.warp(r.startAt - rally.CHECKIN_GRACE());
        vm.prank(ALICE); vm.expectRevert(Rally.NotCreator.selector); rally.checkIn(id, keccak256("start"));
        vm.prank(HOST); rally.checkIn(id, keccak256("start"));
        vm.prank(HOST); vm.expectRevert(Rally.AlreadyCheckedIn.selector); rally.checkIn(id, keccak256("start"));
        vm.warp(r.endAt - 1); vm.expectRevert(Rally.WrongPhase.selector); rally.complete(id);
        vm.warp(r.endAt); rally.complete(id);
        _same(rally.credits(HOST), 29.8 ether); _same(rally.burnOwed(), 0.2 ether);
        vm.prank(HOST); rally.claimCredit(); rally.flushBurnSink();
        vm.expectRevert(Rally.WrongPhase.selector); rally.complete(id);
        vm.prank(HOST); vm.expectRevert(Rally.NothingToClaim.selector); rally.claimCredit();
        vm.expectRevert(Rally.NothingToClaim.selector); rally.flushBurnSink();
        _same(rally.totalLiability(), 0); _accounted();
    }

    function testFinalCheckInSecondIsAllowedButNextSecondIsMissed() public {
        uint64 id = _create(1 ether, 2, 2); _seat(id, ALICE); _seat(id, BOB);
        vm.warp(rally.getRound(id).startAt + rally.CHECKIN_GRACE());
        vm.prank(HOST); rally.checkIn(id, bytes32(0));
        uint64 other = _create(1 ether, 2, 2); _seat(other, ALICE); _seat(other, BOB);
        vm.warp(rally.getRound(other).startAt + rally.CHECKIN_GRACE() + 1);
        vm.prank(HOST); vm.expectRevert(Rally.CheckInWindowClosed.selector); rally.checkIn(other, bytes32(0));
        rally.resolveMissedCheckIn(other); _accounted();
    }

    function testOutgoingFailureKeepsRefundAndCreditClaimable() public {
        uint64 id = _create(10 ether, 2, 4); _seat(id, ALICE);
        vm.warp(rally.getRound(id).deadline); rally.resolve(id);
        token.failures(false, true, false);
        vm.prank(ALICE); vm.expectRevert(Rally.TokenTransferFailed.selector); rally.refund(id);
        require(rally.reserved(id, ALICE), "Reservation lost");
        vm.prank(HOST); vm.expectRevert(Rally.TokenTransferFailed.selector); rally.claimCredit();
        _same(rally.credits(HOST), 10 ether); _accounted();
        token.failures(false, false, false);
        vm.prank(ALICE); rally.refund(id); vm.prank(HOST); rally.claimCredit();
        _same(rally.totalLiability(), 0); _accounted();
    }

    function testIncomingFailureAndFeeTransferRollBackReservation() public {
        uint64 id = _create(10 ether, 2, 4);
        token.failures(true, false, false);
        vm.prank(ALICE); vm.expectRevert(Rally.TokenTransferFailed.selector); rally.reserve(id);
        token.failures(false, false, true);
        vm.prank(ALICE); vm.expectRevert(Rally.NonstandardTokenTransfer.selector); rally.reserve(id);
        require(!rally.reserved(id, ALICE), "Unfunded reservation");
        _same(rally.getRound(id).seats, 0); _accounted();
    }

    function testTokenReentryRejectedOnDepositAndWithdrawal() public {
        uint64 id = _create(10 ether, 2, 4); token.attack(address(rally));
        _seat(id, ALICE); require(token.attackError() == Rally.Reentrant.selector, "Wrong reentry error");
        vm.prank(ALICE); rally.leave(id);
        require(token.attackError() == Rally.Reentrant.selector, "Withdrawal reentry"); _accounted();
    }

    function testRepeatRequiresSameCreatorAndPreservesParent() public {
        uint64 id = _create(10 ether, 2, 4);
        Rally.Params memory p = _params(10 ether, 2, 4); p.parentRound = id;
        vm.prank(ALICE); vm.expectRevert(Rally.NotCreator.selector); rally.createRound(p);
        vm.prank(HOST); uint64 repeated = rally.createRound(p);
        _same(rally.getRound(repeated).parentRound, id);
        require(rally.getRound(repeated).termsHash != rally.getRound(id).termsHash, "Distinct terms should hash differently");
        _accounted();
    }

    function testInvalidTermsAreRejected() public {
        Rally.Params memory p = _params(10 ether, 1, 2);
        vm.prank(HOST); vm.expectRevert(Rally.InvalidTerms.selector); rally.createRound(p);
        p.minimum = 2; p.capacity = 101;
        vm.prank(HOST); vm.expectRevert(Rally.InvalidTerms.selector); rally.createRound(p);
        p.capacity = 2; p.deadline = uint64(block.timestamp + 299);
        vm.prank(HOST); vm.expectRevert(Rally.InvalidTerms.selector); rally.createRound(p);
        p.deadline = uint64(block.timestamp + 300); p.startAt = p.deadline + 1799;
        vm.prank(HOST); vm.expectRevert(Rally.InvalidTerms.selector); rally.createRound(p);
        vm.expectRevert(Rally.RoundNotFound.selector); rally.getRound(999);
    }

    function testFuzzCompletedLiabilities(uint128 seedPrice, uint8 seedMinimum, uint8 seedExtra) public {
        uint128 price = uint128(uint256(seedPrice) % 1e24 + 1);
        uint16 minimum = uint16(seedMinimum) % 98 + 2;
        uint16 seats = minimum + uint16(seedExtra) % (101 - minimum);
        uint64 id = _create(price, minimum, seats);
        for (uint16 i; i < seats; i++) { address who = address(uint160(0x1000 + i)); _fund(who); _seat(id, who); _accounted(); }
        vm.warp(rally.getRound(id).startAt); vm.prank(HOST); rally.checkIn(id, bytes32(0));
        vm.warp(rally.getRound(id).endAt); rally.complete(id); _accounted();
        vm.prank(HOST); rally.claimCredit();
        if (rally.burnOwed() > 0) rally.flushBurnSink();
        _same(rally.totalLiability(), 0); _accounted();
    }

    function testFuzzCancelledLiabilities(uint128 seedPrice, uint8 seedMinimum, uint8 seedExtra) public {
        uint128 price = uint128(uint256(seedPrice) % 1e24 + 1);
        uint16 minimum = uint16(seedMinimum) % 98 + 2;
        uint16 seats = minimum + uint16(seedExtra) % (101 - minimum);
        uint64 id = _create(price, minimum, seats);
        for (uint16 i; i < seats; i++) { address who = address(uint160(0x1000 + i)); _fund(who); _seat(id, who); }
        _confirm(id); vm.prank(HOST); rally.cancel(id); _accounted();
        for (uint16 i; i < seats; i++) { vm.prank(address(uint160(0x1000 + i))); rally.refund(id); _accounted(); }
        if (rally.burnOwed() > 0) rally.flushBurnSink();
        _same(rally.totalLiability(), 0); _accounted();
    }
}
