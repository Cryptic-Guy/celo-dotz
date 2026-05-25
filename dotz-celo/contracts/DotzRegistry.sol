// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DotzRegistry
 * @notice Stores player usernames on-chain. Ultra gas-efficient.
 *         Each address can register once. Username is 3-16 chars.
 */
contract DotzRegistry {
    // username bytes32 is cheaper than string storage
    mapping(address => bytes32) public usernames;
    mapping(bytes32 => address) public usernameOwner;

    event UsernameRegistered(address indexed player, bytes32 username);

    error AlreadyRegistered();
    error UsernameTaken();
    error InvalidUsername();

    /**
     * @notice Register a username. One per wallet, permanent.
     * @param _username 3-16 alphanumeric characters (stored as bytes32)
     */
    function register(bytes32 _username) external {
        if (usernames[msg.sender] != bytes32(0)) revert AlreadyRegistered();
        if (usernameOwner[_username] != address(0)) revert UsernameTaken();
        if (!_validUsername(_username)) revert InvalidUsername();

        usernames[msg.sender] = _username;
        usernameOwner[_username] = msg.sender;

        emit UsernameRegistered(msg.sender, _username);
    }

    function getUsername(address _player) external view returns (bytes32) {
        return usernames[_player];
    }

    function hasUsername(address _player) external view returns (bool) {
        return usernames[_player] != bytes32(0);
    }

    // Check: 3-16 printable ASCII chars (0x20-0x7E)
    function _validUsername(bytes32 b) internal pure returns (bool) {
        uint8 len = 0;
        for (uint8 i = 0; i < 32; i++) {
            uint8 c = uint8(b[i]);
            if (c == 0) break;
            // Allow: A-Z (65-90), a-z (97-122), 0-9 (48-57), _ (95)
            bool ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ||
                      (c >= 48 && c <= 57) || c == 95;
            if (!ok) return false;
            len++;
        }
        return len >= 3 && len <= 16;
    }
}
