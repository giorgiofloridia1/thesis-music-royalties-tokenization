// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @dev Minimal interface to check token holdings from the Artist token.
 */
interface IRoyaltyToken {
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title SoulboundBadge
 * @dev ERC721 soulbound badges unlocked based on token holdings and duration.
 */
contract SoulboundBadge is ERC721, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;
    IRoyaltyToken public royaltyToken;

    struct BadgeType {
        uint256 id;
        string name;
        uint256 minHolding;       // Minimum token balance required
        uint256 holdingDuration;  // Required holding time
        bool active;
    }

    mapping(uint256 => BadgeType) public badgeTypes;
    uint256 public badgeTypeCount;

    // Tracks holding start timestamps per badge type per user
    mapping(uint256 => mapping(address => uint256)) public holdingStartTimestamp;

    // Maps badge token ID → badge type
    mapping(uint256 => uint256) public tokenIdToBadgeType;

    // Events
    event BadgeTypeCreated(uint256 indexed badgeTypeId, string name, uint256 minHolding, uint256 holdingDuration);
    event BadgeTypeUpdated(uint256 indexed badgeTypeId, string name, uint256 minHolding, uint256 holdingDuration, bool active);
    event HoldingProgressUpdated(uint256 indexed badgeTypeId, address indexed user, uint256 startTimestamp);
    event BadgeClaimed(uint256 indexed badgeTypeId, address indexed user, uint256 tokenId);
    event BadgeAwardedByAdmin(uint256 indexed badgeTypeId, address indexed user, uint256 tokenId);
    event BadgeRevoked(uint256 indexed tokenId, address indexed user);

    constructor(address _royaltyToken, string memory name_, string memory symbol_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {
        require(_royaltyToken != address(0), "Royalty token address zero");
        royaltyToken = IRoyaltyToken(_royaltyToken);
    }

    // -----------------------
    // Badge type management
    // -----------------------

    /**
     * @dev Creates a new badge type.
     */
    function createBadgeType(
        string calldata name,
        uint256 minHolding,
        uint256 holdingDurationSeconds
    ) external onlyOwner returns (uint256) {
        badgeTypeCount++;
        badgeTypes[badgeTypeCount] = BadgeType({
            id: badgeTypeCount,
            name: name,
            minHolding: minHolding,
            holdingDuration: holdingDurationSeconds,
            active: true
        });

        emit BadgeTypeCreated(badgeTypeCount, name, minHolding, holdingDurationSeconds);
        return badgeTypeCount;
    }

    /**
     * @dev Updates an existing badge type.
     */
    function updateBadgeType(
        uint256 badgeTypeId,
        string calldata name,
        uint256 minHolding,
        uint256 holdingDurationSeconds,
        bool active
    ) external onlyOwner {
        require(badgeTypeId > 0 && badgeTypeId <= badgeTypeCount, "Invalid badge type");

        BadgeType storage b = badgeTypes[badgeTypeId];
        b.name = name;
        b.minHolding = minHolding;
        b.holdingDuration = holdingDurationSeconds;
        b.active = active;

        emit BadgeTypeUpdated(badgeTypeId, name, minHolding, holdingDurationSeconds, active);
    }

    // -----------------------
    // Holding tracking
    // -----------------------

    /**
     * @dev Updates or resets holding timestamp based on current user's balance.
     */
    function updateHoldingProgress(uint256 badgeTypeId, address user) public {
        require(badgeTypeId > 0 && badgeTypeId <= badgeTypeCount, "Invalid badge type");

        BadgeType memory badge = badgeTypes[badgeTypeId];
        require(badge.active, "Badge type not active");

        uint256 bal = royaltyToken.balanceOf(user);
        uint256 start = holdingStartTimestamp[badgeTypeId][user];

        if (bal >= badge.minHolding) {
            // Start counting if not started
            if (start == 0) {
                holdingStartTimestamp[badgeTypeId][user] = block.timestamp;
                emit HoldingProgressUpdated(badgeTypeId, user, block.timestamp);
            }
        } else {
            // Reset if requirements no longer met
            if (start != 0) {
                holdingStartTimestamp[badgeTypeId][user] = 0;
                emit HoldingProgressUpdated(badgeTypeId, user, 0);
            }
        }
    }

    /**
     * @dev Returns how many seconds the user has held enough tokens so far.
     */
    function secondsHeldSoFar(uint256 badgeTypeId, address user) public view returns (uint256) {
        uint256 start = holdingStartTimestamp[badgeTypeId][user];
        if (start == 0) return 0;
        return block.timestamp - start;
    }

    // -----------------------
    // Claim and assignment
    // -----------------------

    function claimBadge(uint256 badgeTypeId) external returns (uint256) {
        return _claimBadgeFor(badgeTypeId, msg.sender);
    }

    function claimBadgeFor(uint256 badgeTypeId, address user) external returns (uint256) {
        return _claimBadgeFor(badgeTypeId, user);
    }

    /**
     * @dev Internal logic for claiming badge after fulfilling requirements.
     */
    function _claimBadgeFor(uint256 badgeTypeId, address user) internal returns (uint256) {
        require(badgeTypeId > 0 && badgeTypeId <= badgeTypeCount, "Invalid badge type");

        BadgeType memory badge = badgeTypes[badgeTypeId];
        require(badge.active, "Badge type inactive");

        uint256 bal = royaltyToken.balanceOf(user);

        // Check minimum balance requirement
        if (bal < badge.minHolding) {
            // Reset progress
            if (holdingStartTimestamp[badgeTypeId][user] != 0) {
                holdingStartTimestamp[badgeTypeId][user] = 0;
                emit HoldingProgressUpdated(badgeTypeId, user, 0);
            }
            revert("User does not meet minHolding requirement");
        }

        // If no start timestamp, set one and require waiting
        if (holdingStartTimestamp[badgeTypeId][user] == 0) {
            holdingStartTimestamp[badgeTypeId][user] = block.timestamp;
            emit HoldingProgressUpdated(badgeTypeId, user, block.timestamp);
            revert("Holding started now, wait holdingDuration to claim");
        }

        uint256 elapsed = block.timestamp - holdingStartTimestamp[badgeTypeId][user];
        if (elapsed < badge.holdingDuration) {
            revert("Holding duration not reached yet");
        }

        // Mint badge
        _tokenIds.increment();
        uint256 newId = _tokenIds.current();
        _safeMint(user, newId);

        tokenIdToBadgeType[newId] = badgeTypeId;

        // Reset holding timestamp
        holdingStartTimestamp[badgeTypeId][user] = 0;

        emit BadgeClaimed(badgeTypeId, user, newId);
        return newId;
    }

    /**
     * @dev Admin can directly award a badge.
     */
    function awardBadgeByAdmin(uint256 badgeTypeId, address user)
        external
        onlyOwner
        returns (uint256)
    {
        require(badgeTypeId > 0 && badgeTypeId <= badgeTypeCount, "Invalid badge type");

        _tokenIds.increment();
        uint256 newId = _tokenIds.current();

        _safeMint(user, newId);
        tokenIdToBadgeType[newId] = badgeTypeId;

        emit BadgeAwardedByAdmin(badgeTypeId, user, newId);
        return newId;
    }

    /**
     * @dev Owner/admin revokes a badge.
     */
    function revokeBadge(uint256 tokenId) external onlyOwner {
        address ownerOfToken = ownerOf(tokenId);
        _burn(tokenId);
        emit BadgeRevoked(tokenId, ownerOfToken);
    }

    // -----------------------
    // Soulbound behavior
    // -----------------------

    /**
     * @dev Blocks transfers except mint (from=0) and burn (to=0).
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);

        if (from != address(0) && to != address(0)) {
            revert("Soulbound: transfers are disabled");
        }

        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert("Soulbound: approvals are disabled");
    }

    function setApprovalForAll(address, bool) public pure override {
        revert("Soulbound: approvals are disabled");
    }

    // -----------------------
    // Admin utilities
    // -----------------------

    function setRoyaltyToken(address _royaltyToken) external onlyOwner {
        require(_royaltyToken != address(0), "Zero address");
        royaltyToken = IRoyaltyToken(_royaltyToken);
    }

    function getBadgeType(uint256 badgeTypeId) external view returns (BadgeType memory) {
        return badgeTypes[badgeTypeId];
    }

    function adminSetHoldingStart(uint256 badgeTypeId, address user, uint256 timestamp)
        external
        onlyOwner
    {
        holdingStartTimestamp[badgeTypeId][user] = timestamp;
        emit HoldingProgressUpdated(badgeTypeId, user, timestamp);
    }

    /**
     * @dev Badge owner can burn their badge voluntarily.
     */
    function burn(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Only owner can burn");
        _burn(tokenId);
        emit BadgeRevoked(tokenId, msg.sender);
    }
}
