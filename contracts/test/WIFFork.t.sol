// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Rally} from "../src/Rally.sol";
import {Vm} from "./Rally.t.sol";

interface RealWIF {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// @dev Runs only when RALLY_FORK=true. All balance writes affect the local fork.
contract WIFForkTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant WIF = 0x5173b8eA6923c2d40267890D45C46a3480954773;
    address internal constant HOST = address(0xf001);
    address internal constant ALICE = address(0xf002);
    address internal constant BOB = address(0xf003);

    function _localBalance(address who, uint256 amount) internal {
        vm.record(); RealWIF(WIF).balanceOf(who);
        (bytes32[] memory reads,) = vm.accesses(WIF);
        for (uint256 i; i < reads.length; i++) {
            bytes32 before_ = vm.load(WIF, reads[i]);
            vm.store(WIF, reads[i], bytes32(amount));
            if (RealWIF(WIF).balanceOf(who) == amount) return;
            vm.store(WIF, reads[i], before_);
        }
        revert("Real WIF balance storage not found");
    }

    function testForkRealWIFRefundAndCompletedPayout() public {
        if (!vm.envOr("RALLY_FORK", false)) return;
        vm.createSelectFork("https://rpc.mainnet.chain.robinhood.com");
        require(block.chainid == 4663 && WIF.code.length > 0, "Wrong real fork");
        Rally rally = new Rally();
        _localBalance(HOST, 1000 ether); _localBalance(ALICE, 1000 ether); _localBalance(BOB, 1000 ether);
        vm.prank(HOST); require(RealWIF(WIF).approve(address(rally), 10 ether));
        Rally.Params memory p = Rally.Params(10 ether, 2, 5, uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 2 hours), uint64(block.timestamp + 3 hours), 0, "Real-bytecode fork test, no mainnet transaction");
        vm.prank(HOST); uint64 id = rally.createRound(p);
        vm.prank(ALICE); require(RealWIF(WIF).approve(address(rally), 10 ether));
        vm.prank(ALICE); rally.reserve(id);
        vm.warp(p.deadline); vm.prank(ALICE); rally.refund(id);
        vm.prank(HOST); rally.claimCredit();
        require(RealWIF(WIF).balanceOf(ALICE) == 1000 ether && rally.totalLiability() == 0, "Fork refund mismatch");

        p.deadline = uint64(block.timestamp + 1 hours); p.startAt = p.deadline + 1 hours; p.endAt = p.startAt + 1 hours;
        vm.prank(HOST); require(RealWIF(WIF).approve(address(rally), 10 ether));
        vm.prank(HOST); id = rally.createRound(p);
        vm.prank(ALICE); require(RealWIF(WIF).approve(address(rally), 10 ether));
        vm.prank(ALICE); rally.reserve(id);
        vm.prank(BOB); require(RealWIF(WIF).approve(address(rally), 10 ether));
        vm.prank(BOB); rally.reserve(id);
        vm.warp(p.startAt); vm.prank(HOST); rally.checkIn(id, bytes32(0));
        vm.warp(p.endAt); rally.complete(id);
        vm.prank(HOST); rally.claimCredit(); rally.flushBurnSink();
        require(RealWIF(WIF).balanceOf(HOST) == 1019.8 ether, "Fork payout mismatch");
        require(RealWIF(WIF).balanceOf(address(rally)) == 0 && rally.totalLiability() == 0, "Fork accounting mismatch");
    }
}
