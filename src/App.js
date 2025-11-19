// This is the main component of the application.
// It contains all the logic for interacting with the smart contracts.

import React, { useEffect, useState, useRef } from "react";
import { ethers } from "ethers";
import RoyaltyTokenABI from "./abi/RoyaltyToken.json";
import MockCoinABI from "./abi/MockCoin.json";
import SoulboundBadgeABI from "./abi/SoulboundBadge.json";
import "./App.css";

/* global BigInt */

const ROYALTY_TOKEN_ADDRESS = "0x821a9673196681F69c0130714dcff7C70E22B5CE";
const MOCK_COIN_ADDRESS = "0xFa92A7E7182E3f85e5C058Ce4B2b3d374BF586db";
const SOULBOUND_BADGE_ADDRESS = "0xAdD85e759c8D5711AA88DEFd9a7FfeAeBCE6731C";
const ROYALTY_DISTRIBUTOR = "0x8905e0ca806642bd25204f6210c8907ba96c418c";

function App() {
  const [provider, setProvider] = useState(null);
  const [account, setAccount] = useState(null);
  const [royaltyContract, setRoyaltyContract] = useState(null);
  const [mockContract, setMockContract] = useState(null);
  const [soulboundContract, setSoulboundContract] = useState(null);
  const [royaltyName, setRoyaltyName] = useState("");
  const [royaltySymbol, setRoyaltySymbol] = useState("");
  const [mockName, setMockName] = useState("");
  const [mockSymbol, setMockSymbol] = useState("");
  const [soulboundName, setSoulboundName] = useState("");
  const [soulboundSymbol, setSoulboundSymbol] = useState("");
  const [price, setPrice] = useState(0);
  const [tokenBal, setTokenBal] = useState(0);
  const [mockBal, setMockBal] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [buyAmount, setBuyAmount] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [royaltyAmount, setRoyaltyAmount] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [isDistributor, setIsDistributor] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [log, setLog] = useState([]);
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [contractPaused, setContractPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Navigation state
  const [activeSection, setActiveSection] = useState('wallet');

  // Vesting states
  const [vestingInfo, setVestingInfo] = useState(null);
  const [releasingVesting, setReleasingVesting] = useState(false);

  // Soulbound Badge states
  const [badgeTypes, setBadgeTypes] = useState([]);
  const [userBadges, setUserBadges] = useState([]);
  const [holdingProgress, setHoldingProgress] = useState({});
  const [newBadgeName, setNewBadgeName] = useState("");
  const [newBadgeMinHolding, setNewBadgeMinHolding] = useState("");
  const [newBadgeDuration, setNewBadgeDuration] = useState("");
  const [awardBadgeType, setAwardBadgeType] = useState("");
  const [awardBadgeTo, setAwardBadgeTo] = useState("");
  const [revokeTokenId, setRevokeTokenId] = useState("");

  // Progress update interval
  const progressIntervalRef = useRef(null);

  // Ref per simboli per evitare duplicati nei log
  const royaltySymbolRef = useRef(royaltySymbol);
  const mockSymbolRef = useRef(mockSymbol);
  const soulboundSymbolRef = useRef(soulboundSymbol);

  useEffect(() => {
    royaltySymbolRef.current = royaltySymbol;
    mockSymbolRef.current = mockSymbol;
    soulboundSymbolRef.current = soulboundSymbol;
  }, [royaltySymbol, mockSymbol, soulboundSymbol]);

  useEffect(() => {
    if (window.ethereum) {
      const prov = new ethers.BrowserProvider(window.ethereum);
      setProvider(prov);
    } else {
      alert("Installa MetaMask per continuare!");
    }
  }, []);

  const addLog = (message, type = "info") => {
    const newLog = { 
      time: new Date().toLocaleTimeString(), 
      message, 
      type,
      id: Date.now() 
    };
    setLog((prev) => [newLog, ...prev.slice(0, 19)]);
  };

  const showFeedback = (msg, type = "success") => {
    setFeedbackMsg({ text: msg, type });
    setTimeout(() => setFeedbackMsg(""), 3000);
  };

  // Avvia l'aggiornamento automatico del progresso per i badge
  const startProgressUpdates = async () => {
    if (!soulboundContract || !account || !badgeTypes.length) return;
    
    // Ferma eventuali intervalli precedenti
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    // Aggiorna immediatamente
    await updateHoldingProgress();
    
    // Imposta l'intervallo per aggiornamenti periodici (ogni 30 secondi)
    progressIntervalRef.current = setInterval(async () => {
      await updateHoldingProgress();
    }, 30000);
  };

  // Ferma gli aggiornamenti automatici
  const stopProgressUpdates = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const connectWallet = async () => {
    if (!provider) return;
    setIsLoading(true);
    try {
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      const signer = await provider.getSigner();

      const royalty = new ethers.Contract(
        ROYALTY_TOKEN_ADDRESS,
        RoyaltyTokenABI,
        signer
      );
      const mock = new ethers.Contract(MOCK_COIN_ADDRESS, MockCoinABI, signer);
      const soulbound = new ethers.Contract(
        SOULBOUND_BADGE_ADDRESS,
        SoulboundBadgeABI,
        signer
      );

      setRoyaltyContract(royalty);
      setMockContract(mock);
      setSoulboundContract(soulbound);

      setRoyaltyName(await royalty.name());
      setRoyaltySymbol(await royalty.symbol());
      setMockName(await mock.name());
      setMockSymbol(await mock.symbol());
      setSoulboundName(await soulbound.name());
      setSoulboundSymbol(await soulbound.symbol());

      try {
        const owner = await royalty.owner();
        setIsOwner(owner.toLowerCase() === accounts[0].toLowerCase());
        setIsDistributor(accounts[0].toLowerCase() === ROYALTY_DISTRIBUTOR.toLowerCase());

        if (owner.toLowerCase() === accounts[0].toLowerCase()) addLog("Accesso Admin abilitato", "success");
        if (accounts[0].toLowerCase() === ROYALTY_DISTRIBUTOR.toLowerCase()) addLog("Accesso Royalties Distributor abilitato", "success");

        const paused = await royalty.paused();
        setContractPaused(paused);
        
        // Carica info vesting
        await loadVestingInfo(royalty);
        
        // Carica badge types e progresso
        await loadBadgeTypes(soulbound);
        await loadUserBadges(soulbound, accounts[0]);
        
        // Avvia aggiornamenti automatici del progresso
        await startProgressUpdates();
      } catch (err) {
        console.error("Errore owner:", err);
      }

      addLog(`Wallet connesso: ${accounts[0]}`, "success");
      showFeedback("Wallet connesso con successo!");
    } catch (error) {
      addLog("Errore durante la connessione del wallet", "error");
      showFeedback("Errore durante la connessione", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const loadVestingInfo = async (contract = royaltyContract) => {
    if (!contract) return;
    try {
      const info = await contract.getVestingInfo();
      setVestingInfo({
        totalVestingAmount: Number(info[0]),
        startTime: new Date(Number(info[1]) * 1000),
        duration: Number(info[2]),
        totalTranches: Number(info[3]),
        currentTranche: Number(info[4]),
        trancheDuration: Number(info[5]),
        alreadyReleased: Number(info[6]),
        remainingAmount: Number(info[7]),
        nextReleaseTime: new Date(Number(info[8]) * 1000)
      });
    } catch (err) {
      console.error("Errore caricamento vesting info:", err);
    }
  };

  const loadBadgeTypes = async (contract = soulboundContract) => {
    if (!contract) return;
    try {
      const count = await contract.badgeTypeCount();
      const types = [];
      for (let i = 1; i <= count; i++) {
        const badgeType = await contract.getBadgeType(i);
        types.push({
          id: i,
          name: badgeType.name,
          minHolding: Number(badgeType.minHolding),
          holdingDuration: Number(badgeType.holdingDuration),
          active: badgeType.active
        });
      }
      setBadgeTypes(types);
    } catch (err) {
      console.error("Errore caricamento badge types:", err);
    }
  };

  const loadUserBadges = async (contract = soulboundContract, user = account) => {
    if (!contract || !user) return;
    try {
      // Per semplicità, assumiamo che l'utente possa avere massimo 10 badge
      const badges = [];
      for (let i = 1; i <= 10; i++) {
        try {
          const owner = await contract.ownerOf(i);
          if (owner.toLowerCase() === user.toLowerCase()) {
            const badgeTypeId = await contract.tokenIdToBadgeType(i);
            badges.push({
              tokenId: i,
              badgeTypeId: Number(badgeTypeId)
            });
          }
        } catch (err) {
          // Token non esistente, continuiamo
          break;
        }
      }
      setUserBadges(badges);
    } catch (err) {
      console.error("Errore caricamento badge utente:", err);
    }
  };

  const updateHoldingProgress = async (contract = soulboundContract, user = account) => {
    if (!contract || !user) return;
    try {
      const progress = {};
      for (const badgeType of badgeTypes) {
        try {
          // Verifica se l'utente ha già abbastanza token per questo badge
          const tokenBalance = await royaltyContract?.balanceOf(user);
          if (tokenBalance >= BigInt(badgeType.minHolding)) {
            // Aggiorna il progresso solo se l'utente ha i requisiti minimi
            await contract.updateHoldingProgress(badgeType.id, user);
            const seconds = await contract.secondsHeldSoFar(badgeType.id, user);
            progress[badgeType.id] = Number(seconds);
          } else {
            progress[badgeType.id] = 0;
          }
        } catch (err) {
          console.error(`Errore aggiornamento progresso per badge type ${badgeType.id}:`, err);
          progress[badgeType.id] = 0;
        }
      }
      setHoldingProgress(progress);
    } catch (err) {
      console.error("Errore aggiornamento progresso holding:", err);
    }
  };

  // Listener eventi contratti
  useEffect(() => {
    if (!royaltyContract || !soulboundContract) return;

    const handleTransfer = (from, to, amount) => {
      addLog(`Transfer: ${Number(amount)} ${royaltySymbolRef.current} da ${from} a ${to}`, "transfer");
      // Aggiorna stats e progresso badge quando il balance cambia
      refreshStats();
    };

    const handleRoyalties = (by, amount) => {
      addLog(`Royalties distribuite: ${Number(amount)/100} ${mockSymbolRef.current} da ${by}`, "royalty");
      refreshStats();
    };

    const handleVesting = (amount, tranche) => {
      addLog(`Vesting rilasciato: ${Number(amount)} ${royaltySymbolRef.current} (Tranche ${Number(tranche)})`, "vesting");
      refreshStats();
    };

    const handleBadgeClaimed = (badgeTypeId, user, tokenId) => {
      addLog(`Badge claimato: Tipo ${badgeTypeId} da ${user} (Token ${tokenId})`, "success");
      loadUserBadges();
      updateHoldingProgress();
    };

    const handleBadgeAwarded = (badgeTypeId, user, tokenId) => {
      addLog(`Badge assegnato: Tipo ${badgeTypeId} a ${user} (Token ${tokenId})`, "success");
      loadUserBadges();
      updateHoldingProgress();
    };

    const handleBadgeRevoked = (tokenId, user) => {
      addLog(`Badge revocato: Token ${tokenId} da ${user}`, "warning");
      loadUserBadges();
      updateHoldingProgress();
    };

    royaltyContract.on("Transfer", handleTransfer);
    royaltyContract.on("RoyaltiesDistributed", handleRoyalties);
    royaltyContract.on("VestingReleased", handleVesting);
    soulboundContract.on("BadgeClaimed", handleBadgeClaimed);
    soulboundContract.on("BadgeAwardedByAdmin", handleBadgeAwarded);
    soulboundContract.on("BadgeRevoked", handleBadgeRevoked);

    return () => {
      royaltyContract.off("Transfer", handleTransfer);
      royaltyContract.off("RoyaltiesDistributed", handleRoyalties);
      royaltyContract.off("VestingReleased", handleVesting);
      soulboundContract.off("BadgeClaimed", handleBadgeClaimed);
      soulboundContract.off("BadgeAwardedByAdmin", handleBadgeAwarded);
      soulboundContract.off("BadgeRevoked", handleBadgeRevoked);
    };
  }, [royaltyContract, soulboundContract, account]);

  const refreshStats = async () => {
    if (!royaltyContract || !mockContract || !account) return;

    const priceBN = await royaltyContract.viewPricePerToken();
    const priceNum = Number(priceBN) / 100;
    setPrice(priceNum);

    const tokenBN = await royaltyContract.balanceOf(account);
    setTokenBal(Number(tokenBN));

    const mockBN = await mockContract.balanceOf(account);
    setMockBal(Number(mockBN)/100);

    setTotalValue(Number(tokenBN) * priceNum);

    const paused = await royaltyContract.paused();
    setContractPaused(paused);
    
    await loadVestingInfo();
    await updateHoldingProgress();
  };

  const releaseVesting = async () => {
    if (!royaltyContract) return;
    await loadVestingInfo();
    setReleasingVesting(true);
    try {
      const tx = await royaltyContract.releaseVesting({ gasLimit: 300000 });
      await tx.wait();
      addLog("Vesting rilasciato con successo", "success");
      showFeedback("Vesting rilasciato");
      await loadVestingInfo();
      refreshStats();
    } catch (err) {
      console.error("Errore release vesting:", err);
      addLog("Errore nel release vesting", "error");
    } finally {
      setReleasingVesting(false);
    }
  };

  // Funzioni Soulbound Badge
  const createBadgeType = async () => {
    if (!soulboundContract || !newBadgeName || !newBadgeMinHolding || !newBadgeDuration) return;
    setIsLoading(true);
    try {
      const tx = await soulboundContract.createBadgeType(
        newBadgeName,
        newBadgeMinHolding,
        newBadgeDuration
      );
      await tx.wait();
      addLog(`Tipo badge creato: ${newBadgeName}`, "success");
      showFeedback(`Tipo badge ${newBadgeName} creato`);
      setNewBadgeName("");
      setNewBadgeMinHolding("");
      setNewBadgeDuration("");
      await loadBadgeTypes();
      await updateHoldingProgress();
    } catch (err) {
      console.error("Errore creazione badge type:", err);
      addLog("Errore nella creazione del tipo badge", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const claimBadge = async (badgeTypeId) => {
    if (!soulboundContract) return;
    setIsLoading(true);
    try {
      const tx = await soulboundContract.claimBadge(badgeTypeId);
      await tx.wait();
      addLog(`Badge claimato: Tipo ${badgeTypeId}`, "success");
      showFeedback("Badge claimato con successo!");
      await loadUserBadges();
      await updateHoldingProgress();
    } catch (err) {
      console.error("Errore claim badge:", err);
      addLog("Errore nel claim del badge", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const awardBadge = async () => {
    if (!soulboundContract || !awardBadgeType || !awardBadgeTo) return;
    setIsLoading(true);
    try {
      const tx = await soulboundContract.awardBadgeByAdmin(awardBadgeType, awardBadgeTo);
      await tx.wait();
      addLog(`Badge assegnato: Tipo ${awardBadgeType} a ${awardBadgeTo}`, "success");
      showFeedback("Badge assegnato con successo!");
      setAwardBadgeType("");
      setAwardBadgeTo("");
      await loadUserBadges();
      await updateHoldingProgress();
    } catch (err) {
      console.error("Errore assegnazione badge:", err);
      addLog("Errore nell'assegnazione del badge", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const revokeBadge = async () => {
    if (!soulboundContract || !revokeTokenId) return;
    setIsLoading(true);
    try {
      const tx = await soulboundContract.revokeBadge(revokeTokenId);
      await tx.wait();
      addLog(`Badge revocato: Token ${revokeTokenId}`, "warning");
      showFeedback("Badge revocato");
      setRevokeTokenId("");
      await loadUserBadges();
      await updateHoldingProgress();
    } catch (err) {
      console.error("Errore revoca badge:", err);
      addLog("Errore nella revoca del badge", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const burnBadge = async (tokenId) => {
    if (!soulboundContract) return;
    setIsLoading(true);
    try {
      const tx = await soulboundContract.burn(tokenId);
      await tx.wait();
      addLog(`Badge bruciato: Token ${tokenId}`, "warning");
      showFeedback("Badge bruciato");
      await loadUserBadges();
      await updateHoldingProgress();
    } catch (err) {
      console.error("Errore burn badge:", err);
      addLog("Errore nel burn del badge", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Funzioni token operations
  const buyTokens = async () => {
    if (!buyAmount) return;
    setIsLoading(true);
    try {
      const priceBN = await royaltyContract.viewPricePerToken();
      const cost = BigInt(buyAmount) * BigInt(priceBN);

      const allowance = await mockContract.allowance(account, ROYALTY_TOKEN_ADDRESS);
      if (allowance < cost) {
        const txApprove = await mockContract.approve(ROYALTY_TOKEN_ADDRESS, cost);
        await txApprove.wait();
        addLog(`Approvati ${Number(cost)/100} ${mockSymbol} per acquisto`, "info");
      }

      const tx = await royaltyContract.buyFromContract(buyAmount);
      await tx.wait();
      addLog(`Acquistati ${buyAmount} ${royaltySymbol}`, "success");
      showFeedback(`Acquistati ${buyAmount} ${royaltySymbol}`);
      refreshStats();
      setBuyAmount("");
    } catch (error) {
      addLog("Errore durante l'acquisto", "error");
      showFeedback("Errore durante l'acquisto", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const sellTokens = async () => {
    if (!sellAmount) return;
    setIsLoading(true);
    try {
      const tx = await royaltyContract.sellToContract(sellAmount);
      await tx.wait();
      addLog(`Venduti ${sellAmount} ${royaltySymbol}`, "success");
      showFeedback(`Venduti ${sellAmount} ${royaltySymbol}`);
      refreshStats();
      setSellAmount("");
    } catch (error) {
      addLog("Errore durante la vendita", "error");
      showFeedback("Errore durante la vendita", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const transferMock = async () => {
    if (!transferTo || !transferAmount) return;
    setIsLoading(true);
    try {
      const amount = BigInt(Math.floor(transferAmount*100));
      const tx = await mockContract.transfer(transferTo, amount);
      await tx.wait();
      addLog(`Trasferiti ${transferAmount} ${mockSymbol} a ${transferTo}`, "transfer");
      showFeedback(`Trasferiti ${transferAmount} ${mockSymbol}`);
      refreshStats();
      setTransferTo("");
      setTransferAmount("");
    } catch {
      addLog(`Errore trasferimento a ${transferTo}`, "error");
      showFeedback("Errore durante il trasferimento", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const addRoyalties = async () => {
    if (!royaltyAmount) return;
    setIsLoading(true);
    try {
      const amount = BigInt(Math.ceil(royaltyAmount*100));
      const allowance = await mockContract.allowance(account, ROYALTY_TOKEN_ADDRESS);

      if (allowance < amount) {
        const txApprove = await mockContract.approve(ROYALTY_TOKEN_ADDRESS, amount);
        await txApprove.wait();
        addLog(`Approvati ${royaltyAmount} ${mockSymbol} per royalties`, "info");
      }

      const tx = await royaltyContract.distributeRoyalties(amount);
      await tx.wait();
      addLog(`Royalties aggiunte: ${royaltyAmount} ${mockSymbol}`, "royalty");
      showFeedback(`Royalties aggiunte: ${royaltyAmount} ${mockSymbol}`);
      refreshStats();
      setRoyaltyAmount("");
    } catch {
      addLog("Errore durante l'aggiunta delle royalties", "error");
      showFeedback("Errore durante l'aggiunta delle royalties", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const updatePrice = async () => {
    if (!newPrice) return;
    setIsLoading(true);
    try {
      const value = BigInt(Math.floor(newPrice*100));
      const tx = await royaltyContract.updatePrice(value);
      await tx.wait();
      addLog(`Prezzo aggiornato a ${newPrice} ${mockSymbol}`, "info");
      showFeedback(`Prezzo aggiornato: ${newPrice} ${mockSymbol}`);
      setNewPrice("");
      refreshStats();
    } catch {
      addLog("Errore aggiornamento prezzo", "error");
      showFeedback("Errore durante l'aggiornamento del prezzo", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const mintTokens = async () => {
    if (!mintTo || !mintAmount) return;
    setIsLoading(true);
    try {
      const tx = await royaltyContract.mint(mintTo, mintAmount);
      await tx.wait();
      addLog(`Mintati ${mintAmount} ${royaltySymbol} a ${mintTo}`, "success");
      showFeedback(`Mintati ${mintAmount} ${royaltySymbol} a ${mintTo}`);
      setMintTo("");
      setMintAmount("");
      refreshStats();
    } catch {
      addLog("Errore mint", "error");
      showFeedback("Errore durante il mint", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const pauseContract = async () => {
    setIsLoading(true);
    try {
      const tx = await royaltyContract.pause();
      await tx.wait();
      addLog("Contratto messo in pausa", "warning");
      setContractPaused(true);
      showFeedback("Contratto in pausa", "warning");
    } catch {
      addLog("Errore pausa", "error");
      showFeedback("Errore durante la pausa del contratto", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const unpauseContract = async () => {
    setIsLoading(true);
    try {
      const tx = await royaltyContract.unpause();
      await tx.wait();
      addLog("Contratto riattivato", "success");
      setContractPaused(false);
      showFeedback("Contratto attivo");
    } catch {
      addLog("Errore riattivazione", "error");
      showFeedback("Errore durante la riattivazione del contratto", "error");
    } finally {
      setIsLoading(false);
    }
  };

  function formatDuration(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    let parts = [];
    if (d > 0) parts.push(`${d}g`);
    if (h > 0 || d > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);

    return parts.join(" ");
  }

  function formatTimeRemaining(targetTime) {
    const now = new Date();
    const diff = Math.max(0, Math.floor((targetTime.getTime() - now.getTime()) / 1000));

    if (diff === 0) return "Pronto per il rilascio";

    return formatDuration(diff);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopProgressUpdates();
    };
  }, []);

  // Render sections based on active section
  const renderSection = () => {
    switch (activeSection) {
      case 'wallet':
        return (
          <div className="section-content">
            <div className="dashboard-section">
              <div className="user-info-card">
                <div className="user-main">
                  <div className="avatar">
                    <div className="avatar-initials">{account?.slice(2, 4).toUpperCase() || '--'}</div>
                    <div className="avatar-status"></div>
                  </div>
                  <div className="user-details">
                    <h3>Il tuo Wallet</h3>
                    <p className="wallet-address">{account}</p>
                  </div>
                </div>
                <div className="user-badges">
                  {isOwner && <span className="badge admin">👑 Admin</span>}
                  {isDistributor && <span className="badge distributor">💰 Distributor</span>}
                  {userBadges.length > 0 && <span className="badge success">🎖️ {userBadges.length} Badge</span>}
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card primary">
                  <div className="stat-icon">💎</div>
                  <div className="stat-content">
                    <span className="stat-label">Prezzo token attuale</span>
                    <span className="stat-value">{price.toFixed(2)} MC</span>
                    <div className="stat-trend"></div>
                  </div>
                </div>
                <div className="stat-card success">
                  <div className="stat-icon">🪙</div>
                  <div className="stat-content">
                    <span className="stat-label">Quanti token possiedi</span>
                    <span className="stat-value">{tokenBal} {royaltySymbol}</span>
                  </div>
                </div>
                <div className="stat-card warning">
                  <div className="stat-icon">💰</div>
                  <div className="stat-content">
                    <span className="stat-label">MockCoin disponibili</span>
                    <span className="stat-value">{mockBal.toFixed(2)} MC</span>
                  </div>
                </div>
                <div className="stat-card info">
                  <div className="stat-icon">📊</div>
                  <div className="stat-content">
                    <span className="stat-label">Il tuo portafoglio</span>
                    <span className="stat-value">{totalValue.toFixed(2)} MC</span>
                  </div>
                </div>
              </div>
            </div>

            {vestingInfo && vestingInfo.totalVestingAmount > 0 && (
              <div className="vesting-section">
                <div className="section-header">
                  <h2>📦 Vesting schedule</h2>
                  <div className="progress-container">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill"
                        style={{width: `${(vestingInfo.alreadyReleased / vestingInfo.totalVestingAmount) * 100}%`}}
                      ></div>
                    </div>
                  </div>
                </div>
                <div className="vesting-grid">
                  <div className="vesting-card">
                    <span className="vesting-label">Totali in vesting</span>
                    <span className="vesting-value">{vestingInfo.totalVestingAmount}</span>
                  </div>
                  <div className="vesting-card">
                    <span className="vesting-label">Già rilasciati</span>
                    <span className="vesting-value">{vestingInfo.alreadyReleased}</span>
                  </div>
                  <div className="vesting-card">
                    <span className="vesting-label">Rimanenti</span>
                    <span className="vesting-value">{vestingInfo.remainingAmount}</span>
                  </div>
                  <div className="vesting-card">
                    <span className="vesting-label">Tranche</span>
                    <span className="vesting-value">{vestingInfo.currentTranche}/{vestingInfo.totalTranches}</span>
                  </div>
                  <div className="vesting-card">
                    <span className="vesting-label">Prossimo rilascio</span>
                    <span className="vesting-value highlight">
                      {vestingInfo.currentTranche >= vestingInfo.totalTranches
                        ? "Tutti i token sono stati rilasciati"
                        : formatTimeRemaining(vestingInfo.nextReleaseTime)}
                    </span>
                  </div>

                  {isOwner && (
                    <div className="vesting-action">
                      <button 
                        className={`action-btn primary ${releasingVesting ? 'loading' : ''}`}
                        onClick={releaseVesting}
                        disabled={releasingVesting || vestingInfo.currentTranche >= vestingInfo.totalTranches}
                      >
                        {releasingVesting ? (
                          <>
                            <div className="spinner"></div>
                            Rilascio in corso...
                          </>
                        ) : (
                          'Rilascia vesting'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 'operations':
        return (
          <div className="section-content">
            <div className="actions-section">
              <div className="action-group">
                <h3>Token Operations</h3>
                <div className="action-cards">
                  <div className="action-card">
                    <div className="card-header">
                      <span className="card-icon">🛒</span>
                      <h4>Acquista token</h4>
                    </div>
                    <input
                      type="number"
                      value={buyAmount}
                      onChange={(e) => setBuyAmount(e.target.value)}
                      placeholder={`Quantità ${royaltySymbol}`}
                      className="modern-input"
                    />
                    <button className="modern-btn success" onClick={buyTokens} disabled={isLoading}>
                      {isLoading ? 'Processing...' : 'Acquista ora'}
                    </button>
                  </div>

                  <div className="action-card">
                    <div className="card-header">
                      <span className="card-icon">💵</span>
                      <h4>Vendi token</h4>
                    </div>
                    <input
                      type="number"
                      value={sellAmount}
                      onChange={(e) => setSellAmount(e.target.value)}
                      placeholder={`Quantità ${royaltySymbol}`}
                      className="modern-input"
                    />
                    <button className="modern-btn danger" onClick={sellTokens} disabled={isLoading}>
                      {isLoading ? 'Processing...' : 'Vendi ora'}
                    </button>
                  </div>

                  <div className="action-card">
                    <div className="card-header">
                      <span className="card-icon">↗️</span>
                      <h4>Trasferisci MockCoin</h4>
                    </div>
                    <input
                      type="text"
                      value={transferTo}
                      onChange={(e) => setTransferTo(e.target.value)}
                      placeholder="Indirizzo destinatario"
                      className="modern-input"
                    />
                    <input
                      type="number"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder={`Quantità MockCoin`}
                      className="modern-input"
                    />
                    <button className="modern-btn warning" onClick={transferMock} disabled={isLoading}>
                      {isLoading ? 'Processing...' : 'Invia MC'}
                    </button>
                  </div>

                  {isDistributor && (
                    <div className="action-card">
                      <div className="card-header">
                        <span className="card-icon">🎶</span>
                        <h4>Aggiungi royalties</h4>
                      </div>
                      <input
                        type="number"
                        value={royaltyAmount}
                        onChange={(e) => setRoyaltyAmount(e.target.value)}
                        placeholder={`Quantità`}
                        className="modern-input"
                      />
                      <button className="modern-btn primary" onClick={addRoyalties} disabled={isLoading}>
                        {isLoading ? 'Processing...' : 'Distribuisci'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 'badges':
        return (
          <div className="section-content">
            <div className="badge-section">
              <div className="section-header">
                <h2>🎖️ Soulbound Badges</h2>
                <span className="section-subtitle">{soulboundName} - {soulboundSymbol}</span>
              </div>
              
              {/* Badge posseduti dall'utente */}
              <div className="user-badges-section">
                <h3>I tuoi badge</h3>
                {userBadges.length > 0 ? (
                  <div className="badge-grid">
                    {userBadges.map(badge => {
                      const badgeType = badgeTypes.find(bt => bt.id === badge.badgeTypeId);
                      return badgeType ? (
                        <div key={badge.tokenId} className="badge-card owned">
                          <div className="badge-header">
                            <h4>{badgeType.name}</h4>
                            <span className="badge-id">#{badge.tokenId}</span>
                          </div>
                          <div className="badge-content">
                            <p>Minimo possesso: {badgeType.minHolding} {royaltySymbol}</p>
                            <p>Durata richiesta: {formatDuration(badgeType.holdingDuration)}</p>
                          </div>
                          <div className="badge-actions">
                      
                          </div>
                        </div>
                      ) : null;
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>Non hai ancora claimato nessun badge.</p>
                  </div>
                )}
              </div>

              {/* Tipi di badge disponibili */}
              <div className="available-badges-section">
                <h3>Badge disponibili</h3>
                {badgeTypes.filter(bt => bt.active).length > 0 ? (
                  <div className="badge-grid">
                    {badgeTypes.filter(bt => bt.active).map(badgeType => {
                      const progress = holdingProgress[badgeType.id] || 0;
                      const progressPercent = Math.min(100, (progress / badgeType.holdingDuration) * 100);
                      const hasBadge = userBadges.some(b => b.badgeTypeId === badgeType.id);
                      const canClaim = progress >= badgeType.holdingDuration && !hasBadge;

                      return (
                        <div key={badgeType.id} className="badge-card available">
                          <div className="badge-header">
                            <h4>{badgeType.name}</h4>
                            {hasBadge && <span className="badge-status owned">✅ Posseduto</span>}
                            {!hasBadge && canClaim && <span className="badge-status claimable">🎯 Claimabile</span>}
                            {!hasBadge && !canClaim && <span className="badge-status in-progress">⏳ In Progresso</span>}
                          </div>
                          <div className="badge-content">
                            <p>Richiede: {badgeType.minHolding} {royaltySymbol}</p>
                            <p>Durata: {formatDuration(badgeType.holdingDuration)}</p>
                            
                            <div className="progress-container">
                              <div className="progress-label">
                                <span>Progresso: {formatDuration(progress)}</span>
                                <span>{progressPercent.toFixed(1)}%</span>
                              </div>
                              <div className="progress-bar">
                                <div 
                                  className="progress-fill" 
                                  style={{width: `${progressPercent}%`}}
                                ></div>
                              </div>
                            </div>
                          </div>
                          <div className="badge-actions">
                            <button 
                              className={`modern-btn ${canClaim ? 'primary' : 'secondary'}`}
                              onClick={() => claimBadge(badgeType.id)}
                              disabled={!canClaim || hasBadge || isLoading}
                            >
                              {hasBadge ? 'Posseduto' : canClaim ? '🎖️ Claim Badge' : 'Non Disponibile'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>Nessun badge disponibile al momento.</p>
                  </div>
                )}
              </div>

              {/* Pannello Admin per gestione badge */}
              {isOwner && (
                <div className="admin-badge-panel">
                  <h3>👑 Gestione Badge (Admin)</h3>
                  <div className="admin-badge-grid">
                    <div className="admin-badge-card">
                      <h4>Crea Nuovo Tipo Badge</h4>
                      <input
                        type="text"
                        value={newBadgeName}
                        onChange={(e) => setNewBadgeName(e.target.value)}
                        placeholder="Nome badge"
                        className="modern-input"
                      />
                      <input
                        type="number"
                        value={newBadgeMinHolding}
                        onChange={(e) => setNewBadgeMinHolding(e.target.value)}
                        placeholder="Minimo holding token"
                        className="modern-input"
                      />
                      <input
                        type="number"
                        value={newBadgeDuration}
                        onChange={(e) => setNewBadgeDuration(e.target.value)}
                        placeholder="Durata in secondi"
                        className="modern-input"
                      />
                      <button className="modern-btn primary" onClick={createBadgeType} disabled={isLoading}>
                        Crea Tipo Badge
                      </button>
                    </div>

                    <div className="admin-badge-card">
                      <h4>Assegna Badge</h4>
                      <input
                        type="number"
                        value={awardBadgeType}
                        onChange={(e) => setAwardBadgeType(e.target.value)}
                        placeholder="ID tipo badge"
                        className="modern-input"
                      />
                      <input
                        type="text"
                        value={awardBadgeTo}
                        onChange={(e) => setAwardBadgeTo(e.target.value)}
                        placeholder="Indirizzo destinatario"
                        className="modern-input"
                      />
                      <button className="modern-btn success" onClick={awardBadge} disabled={isLoading}>
                        Assegna Badge
                      </button>
                    </div>

                    <div className="admin-badge-card">
                      <h4>Revoca Badge</h4>
                      <input
                        type="number"
                        value={revokeTokenId}
                        onChange={(e) => setRevokeTokenId(e.target.value)}
                        placeholder="ID token badge"
                        className="modern-input"
                      />
                      <button className="modern-btn danger" onClick={revokeBadge} disabled={isLoading}>
                        Revoca Badge
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'admin':
        if (!isOwner) {
          return (
            <div className="section-content">
              <div className="empty-state">
                <h3>Accesso Negato</h3>
                <p>Non hai i permessi per accedere a questa sezione.</p>
              </div>
            </div>
          );
        }

        return (
          <div className="section-content">
            <div className="action-group admin-panel">
              <h3>👑 Pannello Admin</h3>
              <div className="admin-cards">
                <div className="admin-card">
                  <h4>Aggiorna Prezzo</h4>
                  <input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="Nuovo prezzo"
                    className="modern-input"
                  />
                  <button className="modern-btn primary" onClick={updatePrice} disabled={isLoading}>
                    {isLoading ? 'Processing...' : 'Aggiorna'}
                  </button>
                </div>

                <div className="admin-card">
                  <h4>Mint Token</h4>
                  <input
                    type="text"
                    value={mintTo}
                    onChange={(e) => setMintTo(e.target.value)}
                    placeholder="Indirizzo destinatario"
                    className="modern-input"
                  />
                  <input
                    type="number"
                    value={mintAmount}
                    onChange={(e) => setMintAmount(e.target.value)}
                    placeholder="Quantità"
                    className="modern-input"
                  />
                  <button className="modern-btn success" onClick={mintTokens} disabled={isLoading}>
                    {isLoading ? 'Processing...' : 'Mint'}
                  </button>
                </div>

                <div className="admin-card">
                  <h4>Controllo Contratto</h4>
                  <div className="admin-actions">
                    <button className="modern-btn danger" onClick={pauseContract} disabled={isLoading}>
                      ⏸️ Pausa
                    </button>
                    <button className="modern-btn success" onClick={unpauseContract} disabled={isLoading}>
                      ▶️ Riprendi
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="app-container">
  <div className="background-animation">
    <div className="floating-orb orb-1"></div>
    <div className="floating-orb orb-2"></div>
    <div className="floating-orb orb-3"></div>
    <div className="gradient-overlay"></div>
  </div>

  {feedbackMsg && (
    <div className={`feedback-toast show ${feedbackMsg.type}`}>
      <span>{feedbackMsg.text}</span>
    </div>
  )}

  {isLoading && (
    <div className="global-loader">
      <div className="loader-spinner"></div>
      <span>Processing transaction...</span>
    </div>
  )}

  <header className="app-header">
    <div className="header-content">
      <div className="title-section">
        <div className="logo">
          <div className="logo-icon">🎵</div>
          <div className="logo-pulse"></div>
        </div>
        <div className="title-content">
          <h1 className="app-title">{"Artist" || "Artist"}</h1>
          <p className="app-subtitle">Music Royalty Token Platform</p>
        </div>
      </div>
      <div className="header-controls">
        <div className={`status-indicator ${contractPaused ? 'paused' : 'active'}`}>
          <span className="status-dot"></span>
          <span className="status-text">{contractPaused ? 'In pausa' : 'Attivo'}</span>
          <div className="status-glow"></div>
        </div>
        
        {isOwner && (
          <div className="admin-controls">
            <button 
              className="modern-btn danger small" 
              onClick={pauseContract} 
              disabled={contractPaused || isLoading}
            >
              ⏸️ Pausa
            </button>
            <button 
              className="modern-btn success small" 
              onClick={unpauseContract} 
              disabled={!contractPaused || isLoading}
            >
              ▶️ Riprendi
            </button>
          </div>
        )}
        
        {account && (
          <button className="refresh-btn" onClick={refreshStats}>
            <span className="refresh-icon">↻</span>
            Aggiorna
          </button>
        )}
      </div>
    </div>

    {account && (
      <nav className="main-navigation">
        <button 
          className={`nav-item ${activeSection === 'wallet' ? 'active' : ''}`}
          onClick={() => setActiveSection('wallet')}
        >
          <span className="nav-icon">👛</span>
          Wallet
        </button>
        <button 
          className={`nav-item ${activeSection === 'operations' ? 'active' : ''}`}
          onClick={() => setActiveSection('operations')}
        >
          <span className="nav-icon">⚡</span>
          Operazioni
        </button>
        <button 
          className={`nav-item ${activeSection === 'badges' ? 'active' : ''}`}
          onClick={() => setActiveSection('badges')}
        >
          <span className="nav-icon">🎖️</span>
          Badges
        </button>
        <button 
          className={`nav-item ${activeSection === 'log' ? 'active' : ''}`}
          onClick={() => setActiveSection('log')}
        >
          <span className="nav-icon">📜</span>
          Log
        </button>
      </nav>
    )}
  </header>

  <main className="app-main">
    {!account ? (
      <div className="connect-section">
        <div className="connect-card">
          <div className="connect-graphic">
            <div className="graphic-icon">🎵</div>
            <div className="graphic-rings">
              <div className="ring ring-1"></div>
              <div className="ring ring-2"></div>
              <div className="ring ring-3"></div>
            </div>
          </div>
          <h2>Connetti il tuo Wallet</h2>
          <p>Connetti il tuo wallet per iniziare a utilizzare la piattaforma</p>
          <button className="connect-btn" onClick={connectWallet} disabled={isLoading}>
            {isLoading ? 'Connessione in corso...' : 'Connetti Wallet'}
          </button>
        </div>
      </div>
    ) : activeSection === 'log' ? (
      <div className="full-log-section">
        <div className="log-header">
          <h3>📜 Log Eventi Completo</h3>
          <span className="log-count">{log.length}</span>
        </div>
        <div className="log-container full-height">
          {log.map((entry) => (
            <div key={entry.id} className={`log-entry ${entry.type}`}>
              <span className="log-time">[{entry.time}]</span>
              <span className="log-message">{entry.message}</span>
            </div>
          ))}
          {log.length === 0 && (
            <div className="log-empty">Nessun evento ancora registrato</div>
          )}
        </div>
      </div>
    ) : (
      <div className="content-column">
        {renderSection()}
      </div>
    )}
  </main>
</div>
  );
}

export default App;