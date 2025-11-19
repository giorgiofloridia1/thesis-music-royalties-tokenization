// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title ArtistCareerToken
 * @dev ERC20 token with royalties-based pricing, vesting, and buy/sell marketplace.
 */
contract ArtistCareerToken is ERC20, Ownable, Pausable, ReentrancyGuard {
    IERC20 public stablecoin;
    uint256 public lastRoyalties;
    uint256 public pricePerToken;

    uint256 public constant PRICE_SCALE = 1e2;

    // Vesting
    uint256 public vestingAmount;
    uint256 public vestingStartTime;
    uint256 public vestingDuration;
    uint256 public numTranches;
    uint256 public currentTranche;
    uint256 public releasedAmount;
    uint256 public trancheDuration;

    // Address allowed to distribute royalties
    address public immutable royaltyDistributor;

    event RoyaltiesDistributed(address indexed from, uint256 amount, uint256 newPrice);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice, uint256 lastRoyalties);
    event TokensBought(address indexed buyer, uint256 tokenAmount, uint256 cost);
    event TokensSold(address indexed seller, uint256 tokenAmount, uint256 revenue);
    event VestingReleased(uint256 amount, uint256 tranche);

    /**
     * @dev Initializes token, vesting schedule, and initial price.
     */
    constructor(
        IERC20 _stablecoin,
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        uint256 initialRoyalties,
        address _owner,
        address _royaltyDistributor,
        uint256 _vestingPercentage,
        uint256 _vestingDuration,
        uint256 _numTranches
    ) ERC20(name, symbol) Ownable(_owner) {

        require(_royaltyDistributor != address(0), "Invalid distributor address");
        require(totalSupply > 0, "totalSupply>0");
        require(_vestingPercentage <= 100, "Vesting percentage too high");

        stablecoin = _stablecoin;
        royaltyDistributor = _royaltyDistributor;
        lastRoyalties = initialRoyalties;

        // Vesting configuration
        vestingAmount = (totalSupply * _vestingPercentage) / 100;
        vestingStartTime = block.timestamp;
        vestingDuration = _vestingDuration;
        numTranches = _numTranches;
        currentTranche = 0;
        releasedAmount = 0;
        trancheDuration = _vestingDuration / _numTranches;

        // Mint immediately available and vested supply
        uint256 immediateAmount = totalSupply - vestingAmount;
        _mint(_owner, immediateAmount);
        _mint(address(this), vestingAmount);

        // Initial price
        pricePerToken = (initialRoyalties > 0)
            ? (initialRoyalties * PRICE_SCALE) / totalSupply
            : 0;
    }

    // ---------------- Vesting ----------------

    /**
     * @dev Releases vested tokens based on elapsed time.
     */
    function releaseVesting() external nonReentrant {
        require(block.timestamp >= vestingStartTime, "Vesting not started");
        require(currentTranche < numTranches, "Vesting completed");

        uint256 timeSinceStart = block.timestamp - vestingStartTime;
        uint256 tranchesPassed = timeSinceStart / trancheDuration;

        if (tranchesPassed > numTranches) {
            tranchesPassed = numTranches;
        }

        require(tranchesPassed > currentTranche, "No new tranches");

        uint256 tranchesToRelease = tranchesPassed - currentTranche;
        uint256 amountPerTranche = vestingAmount / numTranches;
        uint256 amountToRelease = tranchesToRelease * amountPerTranche;

        // Final tranche: release remaining amount
        if (currentTranche + tranchesToRelease == numTranches) {
            amountToRelease = vestingAmount - releasedAmount;
        }

        releasedAmount += amountToRelease;
        currentTranche += tranchesToRelease;

        _transfer(address(this), owner(), amountToRelease);
        emit VestingReleased(amountToRelease, currentTranche);
    }

    /**
     * @dev Returns vesting details for UI/analysis.
     */
    function getVestingInfo() external view returns (
        uint256 totalVestingAmount,
        uint256 startTime,
        uint256 duration,
        uint256 totalTranches,
        uint256 currentTrancheNumber,
        uint256 trancheTime,
        uint256 alreadyReleased,
        uint256 remainingAmount,
        uint256 nextReleaseTime
    ) {
        totalVestingAmount = vestingAmount;
        startTime = vestingStartTime;
        duration = vestingDuration;
        totalTranches = numTranches;
        currentTrancheNumber = currentTranche;
        trancheTime = trancheDuration;
        alreadyReleased = releasedAmount;
        remainingAmount = vestingAmount - releasedAmount;
        nextReleaseTime = currentTranche < numTranches
            ? vestingStartTime + ((currentTranche + 1) * trancheDuration)
            : 0;
    }

    // ---------------- Royalties ----------------

    /**
     * @dev Updates the token price based on new royalties.
     */
    function distributeRoyalties(uint256 royaltyAmount)
        external
        whenNotPaused
        nonReentrant
    {
        require(msg.sender == royaltyDistributor, "Not authorized");
        require(royaltyAmount > 0, "royaltyAmount>0");

        bool ok = stablecoin.transferFrom(msg.sender, address(this), royaltyAmount);
        require(ok, "stablecoin transferFrom failed");

        uint256 totalTok = totalSupply();

        uint256 oldPrice = pricePerToken;
        uint256 newPrice = (lastRoyalties == 0)
            ? (totalTok > 0 ? (royaltyAmount * PRICE_SCALE) / totalTok : 0)
            : (pricePerToken * royaltyAmount) / lastRoyalties;

        pricePerToken = newPrice;
        lastRoyalties = royaltyAmount;

        emit RoyaltiesDistributed(msg.sender, royaltyAmount, newPrice);
        emit PriceUpdated(oldPrice, newPrice, lastRoyalties);
    }

    // ---------------- Marketplace ----------------

    /**
     * @dev Direct token purchase from contract pool.
     */
    function buyFromContract(uint256 tokenAmount)
        external
        whenNotPaused
        nonReentrant
    {
        require(tokenAmount > 0, "tokenAmount>0");

        uint256 cost = (pricePerToken * tokenAmount) / PRICE_SCALE;
        require(cost > 0, "cost==0");

        bool ok = stablecoin.transferFrom(msg.sender, address(this), cost);
        require(ok, "stablecoin transferFrom failed");

        uint256 available = balanceOf(owner()) + balanceOf(address(this));
        require(available >= tokenAmount, "not enough tokens");

        // Use contract balance first, then owner's
        if (balanceOf(address(this)) >= tokenAmount) {
            _transfer(address(this), msg.sender, tokenAmount);
        } else {
            uint256 fromPool = balanceOf(address(this));
            if (fromPool > 0) _transfer(address(this), msg.sender, fromPool);
            _transfer(owner(), msg.sender, tokenAmount - fromPool);
        }

        emit TokensBought(msg.sender, tokenAmount, cost);
    }

    /**
     * @dev Sells tokens back to the contract for stablecoins.
     */
    function sellToContract(uint256 tokenAmount)
        external
        whenNotPaused
        nonReentrant
    {
        require(tokenAmount > 0, "tokenAmount>0");

        uint256 revenue = (pricePerToken * tokenAmount) / PRICE_SCALE;
        require(revenue > 0, "revenue==0");
        require(stablecoin.balanceOf(address(this)) >= revenue, "no liquidity");

        _transfer(msg.sender, address(this), tokenAmount);

        bool ok = stablecoin.transfer(msg.sender, revenue);
        require(ok, "stablecoin transfer failed");

        emit TokensSold(msg.sender, tokenAmount, revenue);
    }

    // ---------------- Admin ----------------

    function ownerWithdrawStablecoin(uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        require(stablecoin.balanceOf(address(this)) >= amount, "insufficient balance");
        bool ok = stablecoin.transfer(owner(), amount);
        require(ok, "transfer failed");
    }

    function setStablecoin(IERC20 _stablecoin) external onlyOwner {
        stablecoin = _stablecoin;
    }

    function pause() external onlyOwner { _pause(); }

    function unpause() external onlyOwner { _unpause(); }

    function viewPricePerToken() external view returns (uint256) {
        return pricePerToken;
    }

    function viewLastRoyalties() external view returns (uint256) {
        return lastRoyalties;
    }
}
