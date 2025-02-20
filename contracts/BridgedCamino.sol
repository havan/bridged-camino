// SPDX-License-Identifier: BSD-3-Clause
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.22;

import { AccessControlEnumerableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { ERC20BurnableUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import { ERC20PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { BlacklistableUpgradeable } from "./BlacklistableUpgradeable.sol";

contract BridgedCaminoV1 is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    AccessControlEnumerableUpgradeable,
    ERC20PermitUpgradeable,
    BlacklistableUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant PAUSER_ROLE_ADMIN = keccak256("PAUSER_ROLE_ADMIN");

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant MINTER_ROLE_ADMIN = keccak256("MINTER_ROLE_ADMIN");

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant UPGRADER_ROLE_ADMIN = keccak256("UPGRADER_ROLE_ADMIN");

    /***************************************************
     *                   STORAGE                       *
     ***************************************************/

    /// @custom:storage-location erc7201:camino.network.BridgedCaminoV1
    struct BridgedCaminoV1Storage {
        // Minter allowances
        mapping(address minter => uint256 allowance) minterAllowed;
    }

    // keccak256(abi.encode(uint256(keccak256("camino.network.BridgedCaminoV1")) - 1)) & ~bytes32(uint256(0xff));
    bytes32 private constant BridgedCaminoV1StorageLocation =
        0x182ef02838af5b5b479414017cf218d6b9338a983918bfae3ca63eb3174f1500;

    function _getBridgedCaminoV1Storage() internal pure returns (BridgedCaminoV1Storage storage $) {
        assembly {
            $.slot := BridgedCaminoV1StorageLocation
        }
    }

    /***************************************************
     *                    EVENTS                       *
     ***************************************************/

    event Mint(address indexed minter, address indexed to, uint256 amount);

    event Burn(address indexed minter, address indexed from, uint256 amount);

    event MinterConfigured(address indexed minter, uint256 allowance, bool newMinter);

    event MinterRemoved(address indexed minter);

    /***************************************************
     *                    ERRORS                       *
     ***************************************************/

    error AmountExceedsMintAllowance(address _minter, uint256 _amount);

    /***************************************************
     *                     INIT                        *
     ***************************************************/

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address defaultAdmin, address pauser, address upgrader) public initializer {
        __ERC20_init("BridgedCamino", "WCAM");
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __AccessControl_init();
        __ERC20Permit_init("BridgedCamino");
        __UUPSUpgradeable_init();
        __Blacklistable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, pauser);
        _grantRole(UPGRADER_ROLE, upgrader);

        _setRoleAdmin(PAUSER_ROLE, PAUSER_ROLE_ADMIN);
        _setRoleAdmin(MINTER_ROLE, MINTER_ROLE_ADMIN);
        _setRoleAdmin(UPGRADER_ROLE, UPGRADER_ROLE_ADMIN);
    }

    /***************************************************
     *                     MINT                        *
     ***************************************************/

    function mint(
        address to,
        uint256 amount
    ) external virtual whenNotPaused onlyRole(MINTER_ROLE) notBlacklisted(to) notBlacklisted(msg.sender) {
        BridgedCaminoV1Storage storage $ = _getBridgedCaminoV1Storage();

        uint256 minterAllowedAmount = $.minterAllowed[msg.sender];

        if (minterAllowedAmount < amount) {
            revert AmountExceedsMintAllowance(msg.sender, amount);
        }

        $.minterAllowed[msg.sender] = minterAllowedAmount - amount;

        emit Mint(msg.sender, to, amount);

        _mint(to, amount);
    }

    function minterAllowance(address minter) external view virtual returns (uint256 amount) {
        BridgedCaminoV1Storage storage $ = _getBridgedCaminoV1Storage();
        return $.minterAllowed[minter];
    }

    function configureMinter(
        address minter,
        uint256 minterAllowedAmount
    ) external whenNotPaused onlyRole(MINTER_ROLE_ADMIN) {
        BridgedCaminoV1Storage storage $ = _getBridgedCaminoV1Storage();

        // Grant minter role
        bool granted = _grantRole(MINTER_ROLE, minter);

        // Set minter allowance
        $.minterAllowed[minter] = minterAllowedAmount;

        // Emit event
        emit MinterConfigured(minter, minterAllowedAmount, granted);
    }

    function removeMinter(address minter) external virtual onlyRole(MINTER_ROLE_ADMIN) {
        BridgedCaminoV1Storage storage $ = _getBridgedCaminoV1Storage();

        // Revoke minter role
        _revokeRole(MINTER_ROLE, minter);

        // Remove minter allowance
        $.minterAllowed[minter] = 0;

        // Emit event
        emit MinterRemoved(minter);
    }

    /***************************************************
     *                     BURN                        *
     ***************************************************/

    function burn(
        uint256 amount
    ) public virtual override whenNotPaused onlyRole(MINTER_ROLE) notBlacklisted(msg.sender) {
        emit Burn(msg.sender, msg.sender, amount);
        super.burn(amount);
    }

    function burnFrom(
        address account,
        uint256 amount
    ) public virtual override whenNotPaused onlyRole(MINTER_ROLE) notBlacklisted(msg.sender) notBlacklisted(account) {
        emit Burn(msg.sender, account, amount);
        super.burnFrom(account, amount);
    }

    /***************************************************
     *                    PAUSER                       *
     ***************************************************/

    function pause() public virtual onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public virtual onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(UPGRADER_ROLE) {}

    // The following functions are overrides required by Solidity.

    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        super._update(from, to, value);
    }
}
