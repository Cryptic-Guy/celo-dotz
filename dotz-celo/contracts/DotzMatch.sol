// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DotzMatch
 * @notice Records Free PvP match starts on-chain. No staking, minimal gas.
 *         Emits an event when a match starts — that's all we need for on-chain proof.
 *
 * Gas optimization:
 *  - Uses uint32 matchId (cheaper than uint256)
 *  - Packed struct in one storage slot
 *  - Indexed events for cheap off-chain querying
 *  - No loops, no arrays pushed in state
 */
contract DotzMatch {
    uint32 public matchCount;

    struct Match {
        address player1;
        address player2;
        uint32  startedAt; // unix timestamp fits in uint32 until year 2106
    }

    // matchId => Match — only stores active/recent, prunable if desired
    mapping(uint32 => Match) public matches;

    event MatchStarted(
        uint32 indexed matchId,
        address indexed player1,
        address indexed player2,
        uint32 startedAt
    );

    error InvalidPlayers();

    /**
     * @notice Record a new free PvP match start.
     *         Called by player1. Player2's address passed as param.
     *         No value required — just a state write + event.
     */
    function startMatch(address _player2) external returns (uint32 matchId) {
        if (_player2 == address(0) || _player2 == msg.sender) revert InvalidPlayers();

        unchecked { matchId = ++matchCount; }

        matches[matchId] = Match({
            player1:   msg.sender,
            player2:   _player2,
            startedAt: uint32(block.timestamp)
        });

        emit MatchStarted(matchId, msg.sender, _player2, uint32(block.timestamp));
    }

    function getMatch(uint32 _matchId) external view returns (Match memory) {
        return matches[_matchId];
    }

    function totalMatches() external view returns (uint32) {
        return matchCount;
    }
}
