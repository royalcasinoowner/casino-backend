import re

with open('engine.js', 'r') as f:
    content = f.read()

replacement = """class SpinnerBetRoom {
    constructor(roomId, io, size, minBet, maxBet, dbHooks) {
        this.roomId = roomId;
        this.io = io;
        this.size = size;
        this.minBet = minBet;
        this.maxBet = maxBet;
        this.db = dbHooks;
        
        this.players = [];
        this.phase = 'waiting';
        this.roundTimer = 20;
        this.timerInterval = null;
        this.botTimers = [];
        this.spinTimeout = null;
        this.fillTimeout = null;
    }

    initializePlaceholders() {
        for (let i = this.players.length; i < this.size; i++) {
            this.players.push({
                uid: `search_${Date.now()}_${i}`,
                isSearching: true,
                ai: false, bet: 0, ready: false, socketId: null, roundsPlayed: 0
            });
        }
        this.restartFillTimer();
    }

    addPlayer(uid, name, socketId, chips, ai = false, avatar = null, equippedFrame = null) {
        if (this.players.find(p => p.uid === uid)) return false;

        const searchIdx = this.players.findIndex(p => p.isSearching);
        const newPlayer = {
            uid, name, socketId, chips, bet: 0, ai, avatar,
            vipLevel: equippedFrame !== null ? equippedFrame : 0,
            ready: false, roundsPlayed: 0
        };

        if (searchIdx !== -1) {
            this.players[searchIdx] = newPlayer;
        } else if (this.players.length < this.size) {
            this.players.push(newPlayer);
        } else {
            return false;
        }
        
        this.broadcastState('player_joined_waiting');
        this.restartFillTimer();
        this.checkFullRoom();
        return true;
    }

    removePlayer(uid) {
        const idx = this.players.findIndex(p => p.uid === uid);
        if (idx === -1) return;

        if (this.phase === 'betting' || this.phase === 'waiting') {
            this.phase = 'waiting';
            clearInterval(this.timerInterval);
            this.botTimers.forEach(clearTimeout);
            this.botTimers = [];

            this.players.forEach(p => {
                if (!p.ai && p.bet > 0) {
                    this.db.dbAdjustBalance(p.uid, p.bet, p.bet).catch(() => {});
                }
                p.bet = 0;
                p.ready = false;
            });

            this.players[idx] = {
                uid: `search_${Date.now()}_${idx}`,
                isSearching: true, ai: false, bet: 0, ready: false, socketId: null, roundsPlayed: 0
            };

            this.broadcastState('player_left_searching');
            this.restartFillTimer();
        } else {
            this.players[idx].socketId = null;
            this.broadcastState('player_left');
        }
    }

    restartFillTimer() {
        if (this.phase !== 'waiting') return;
        if (this.fillTimeout) clearTimeout(this.fillTimeout);

        this.fillTimeout = setTimeout(() => {
            if (this.phase !== 'waiting') return;
            this.fillWithBots();
            this.checkFullRoom();
        }, 10000);
    }

    fillWithBots() {
        let added = false;
        this.players.forEach((p, idx) => {
            if (p.isSearching) {
                added = true;
                const bIdx = Date.now() + idx;
                const bName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
                const bAvatar = `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(bName)}&backgroundColor=0d9488`;
                const bFrame = Math.random() > 0.5 ? Math.floor(Math.random() * 5) + 1 : 0;
                
                this.players[idx] = {
                    uid: `bot_${bIdx}`, name: bName, socketId: null,
                    chips: Math.floor(2000 + Math.random()*8000),
                    bet: 0, ai: true, avatar: bAvatar, vipLevel: bFrame, ready: false, roundsPlayed: 0
                };
            }
        });
        if (added) this.broadcastState('bot_joined_initial');
    }

    checkFullRoom() {
        if (this.phase !== 'waiting') return;
        if (this.players.length === this.size && !this.players.some(p => p.isSearching)) {
            if (this.fillTimeout) clearTimeout(this.fillTimeout);
            this.startMatch();
        }
    }

    async startMatch() {"""

# Replace from class SpinnerBetRoom { to async startMatch() {
content = re.sub(r'class SpinnerBetRoom \{[\s\S]*?async startMatch\(\) \{', replacement, content)

# Remove this.fillWithBots(); from startMatch
content = re.sub(r'this\.fillWithBots\(\);\s*', '', content)

start_next_round = """    startNextRound() {
        this.players.forEach(p => {
            p.bet = 0;
            p.ready = false;
        });

        this.players = this.players.filter(p => p.ai || p.socketId !== null);
        this.players = this.players.filter(p => !p.ai || Math.random() > 0.2);

        if (this.players.filter(p => !p.ai).length === 0) {
            this.destroy();
            return;
        }

        this.phase = 'waiting';
        this.initializePlaceholders();
    }"""

content = re.sub(r'    startNextRound\(\) \{[\s\S]*?    \}', start_next_round, content, count=1)

# add to destroy
content = re.sub(r'clearInterval\(this\.timerInterval\);', 'clearInterval(this.timerInterval);\n        if (this.fillTimeout) clearTimeout(this.fillTimeout);', content)

with open('engine.js', 'w') as f:
    f.write(content)
