const fs = require('fs');
const path = require('path');

const serverJsPath = path.resolve(__dirname, 'server.js');
let content = fs.readFileSync(serverJsPath, 'utf8');

// Require MinesEngine at the top if not present
if (!content.includes("const MinesEngine = require('./games/mines/MinesEngine');")) {
    content = content.replace("const crypto = require('crypto');", "const crypto = require('crypto');\nconst MinesEngine = require('./games/mines/MinesEngine');");
}

const startMarker = "// -------------------------------------------------------------\n// GAME 3: MINES (Namespace '/mines')";
const endMarker = "// -------------------------------------------------------------\n// GAME 4: CASINO SPIN";

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find markers");
    process.exit(1);
}

const newMinesLogic = \`// -------------------------------------------------------------
// GAME 3: MINES (Namespace '/mines')
// -------------------------------------------------------------
const minesNamespace = io.of('/mines');
const activeMinesSockets = {}; // socketId -> playerUid

minesNamespace.on('connection', (socket) => {
    socket.on('join', async ({ id, name }) => {
        const player = await dbGetPlayer(id);
        if (!player) return;
        socket.data.uid = id;
        socket.data.name = name;
        activeMinesSockets[socket.id] = id;
        
        try {
            const activeRound = await MinesEngine._getActiveRound(id);
            if (activeRound) {
                const state = { 
                    active: true, 
                    bet: activeRound.bet, 
                    mCnt: activeRound.minesCount, 
                    gSz: 5, 
                    mines: [], 
                    revd: activeRound.revealed,
                    score: MinesEngine._calcScore(activeRound.revealed.length),
                    combo: activeRound.revealed.length
                };
                socket.emit('gameStateUpdate', state);
            } else {
                socket.emit('gameStateUpdate', { active: false, bet: 0, mCnt: 3, gSz: 5, mines: [], revd: [], score: 0, combo: 0 });
            }
        } catch (err) {
            console.error("Mines join error:", err);
            socket.emit('gameStateUpdate', { active: false, bet: 0, mCnt: 3, gSz: 5, mines: [], revd: [], score: 0, combo: 0 });
        }

        const pObj = await dbGetPlayer(id);
        const isDepositWithdrawalEnabled = await dbGetSetting('deposit_withdrawal_enabled', 'false') === 'true';
        const depositWithdrawalPercent = parseInt(await dbGetSetting('deposit_withdrawal_percent', '0')) || 0;
        let effectiveWithdrawable = pObj.balance || 0;
        if (isDepositWithdrawalEnabled && depositWithdrawalPercent > 0) {
            effectiveWithdrawable = Math.max(pObj.withdrawable_balance || 0, Math.floor(pObj.balance * (depositWithdrawalPercent / 100)));
        }
        effectiveWithdrawable = Math.min(pObj.balance, effectiveWithdrawable);

        socket.emit('balanceUpdate', {
            balance: pObj.balance,
            level: pObj.level || 1,
            total_spent: pObj.total_spent || 0,
            withdrawable_balance: effectiveWithdrawable,
            bonus_balance: pObj.bonus_balance || 0
        });
    });

    socket.on('disconnect', () => {
        delete activeMinesSockets[socket.id];
    });

    socket.on('startGame', async ({ betAmount, minesCount, gridSize }, callback) => {
        const uid = socket.data.uid;
        if (!uid || !betAmount) return callback({ error: 'Invalid bet' });

        const minBetStr = await dbGetSetting('mines_min_bet', '10');
        const maxBetStr = await dbGetSetting('mines_max_bet', '50000');
        const minBet = parseInt(minBetStr) || 10;
        const maxBet = parseInt(maxBetStr) || 50000;

        if (betAmount < minBet || betAmount > maxBet) return callback({ error: \`Bet must be between ₹\${minBet} and ₹\${maxBet}\` });

        const lockKey = \`mines_\${uid}\`;
        const acquired = await lockManager.acquire(lockKey);
        if (!acquired) {
            return callback({ error: 'Please wait, your previous request is still processing.' });
        }

        try {
            const round = await MinesEngine.startRound(uid, betAmount, minesCount);
            
            const state = {
                active: true,
                bet: betAmount,
                mCnt: minesCount,
                gSz: gridSize || 5,
                mines: [],
                revd: [],
                score: 0,
                combo: 0,
                commitment: round.commitment
            };
            socket.emit('gameStateUpdate', state);
            
            const pObj = await dbGetPlayer(uid);
            callback({ success: true, balance: pObj.balance });
        } catch (e) {
            callback({ error: e.message });
        } finally {
            lockManager.release(lockKey);
        }
    });

    socket.on('clickTile', async ({ idx }, callback) => {
        const uid = socket.data.uid;
        if (!uid) return callback({ error: 'Not authenticated' });

        const lockKey = \`mines_\${uid}\`;
        const acquired = await lockManager.acquire(lockKey);
        if (!acquired) return callback({ error: 'Processing' });

        try {
            const result = await MinesEngine.revealTile(uid, null, idx);
            if (result.isMine) {
                // Game Over - lost
                socket.emit('betResult', { 
                    win: false, 
                    payout: 0, 
                    hash: result.serverSeed, 
                    salt: result.salt 
                });
                const state = { active: false, bet: 0, mCnt: 3, gSz: 5, mines: result.mines, revd: [] };
                socket.emit('gameStateUpdate', state);
            } else {
                // Safe reveal
                const pObj = await dbGetPlayer(uid);
                socket.emit('balanceUpdate', { balance: pObj.balance });
            }
            callback({ success: true });
        } catch (e) {
            callback({ error: e.message });
        } finally {
            lockManager.release(lockKey);
        }
    });

    socket.on('cashOut', async (callback) => {
        const uid = socket.data.uid;
        if (!uid) return callback({ error: 'Not authenticated' });

        const lockKey = \`mines_\${uid}\`;
        const acquired = await lockManager.acquire(lockKey);
        if (!acquired) return callback({ error: 'Processing' });

        try {
            const result = await MinesEngine.cashout(uid, null);
            socket.emit('betResult', { 
                win: true, 
                payout: result.payout, 
                hash: result.serverSeed, 
                salt: result.salt 
            });
            const state = { active: false, bet: 0, mCnt: 3, gSz: 5, mines: result.mines, revd: [] };
            socket.emit('gameStateUpdate', state);
            
            const pObj = await dbGetPlayer(uid);
            socket.emit('balanceUpdate', { balance: pObj.balance });
            callback({ success: true });
        } catch (e) {
            callback({ error: e.message });
        } finally {
            lockManager.release(lockKey);
        }
    });
});

\`;

content = content.substring(0, startIndex) + newMinesLogic + content.substring(endIndex);

fs.writeFileSync(serverJsPath, content, 'utf8');
console.log('Successfully wired MinesEngine to server.js');
