// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title MockStablecoin
 * @dev Simple ERC20 token (2 decimals) for testing/demo purposes.
 */
contract MockStablecoin is ERC20, Ownable, Pausable {

    /**
     * @dev Mints the initial supply to the deployer.
     */
    constructor(uint256 initialSupply) 
        ERC20("Token EUR", "TEUR") 
        Ownable(msg.sender) 
    {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    /**
     * @dev Owner can mint new tokens when not paused.
     */
    function mint(address to, uint256 amount) 
        external 
        onlyOwner 
        whenNotPaused 
    {
        _mint(to, amount * 10 ** decimals());
    }

    /**
     * @dev Token uses 2 decimals (like a fiat currency).
     */
    function decimals() public pure override returns (uint8) {
        return 2;
    }

    /** Pause controls (owner only) */
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
