

module.exports = {
    
    create: function (io)
    {
        GameManager._io = io;
        return GameManager;
    }
};

let GameManager = {

    gamelist: { },

    _io : null,

    destroyGame: function (room)
    {
        if (typeof this.gamelist[room] !== "undefined")
        {
            console.log("Game room destroyed: " + room);
            this.gamelist[room] = null;
            delete this.gamelist[room];
        }
    },

    /**
     * Get a game room by its name
     * @param {String} room
     * @return {GameManager.gamelist} Room or NULL
     */
    _getRoom: function (room)
    {
        return typeof this.gamelist[room] === "undefined" ? null : this.gamelist[room];
    },

    getRoom: function (room)
    {
        return this._getRoom(room);
    },
    
    /**
     * @deprecated 
     */
    updateLastSeen : function(userId, room)
    {
        /* deprecated */
    },

    /**
     * Check if a given player is already in a room
     * @param {Object} pRoom
     * @param {String} username
     * @return {Boolean}
     */
    _playerIsInRomm: function (pRoom, userId)
    {
        if (pRoom === null || userId.length === "")
            return false;

        for (var i = 0; i < pRoom.players.length; i++)
        {
            if (pRoom.players[i].id === userId)
                return true;
        }

        return false;
    },

    /**
     * Register a game room and
     * setup a playboard with a given number of expected players
     * 
     * @param {String} room
     * @param {Integer} expectPlayers
     * @return {Object} Game Room
     */
    registerGame: function (room, nExpected, gameType)
    {
        if (room.length < 2 || typeof this.gamelist[room] !== "undefined")
            return null;
        else
        {
            this.gamelist[room] = require("./app/index.js").requestNew(this._io, room, nExpected, gameType);
            return this.gamelist[room];
        }
    },
    
    /**
     * Add a player and their deck to a given room if not already in it
     * 
     * @param {Object} socket
     * @param {String} room
     * @param {String} username
     * @param {String} userid
     * @param {Object} deck
     * @return {Boolean} success state
     */
    addPlayerToGameRoom: function (pRoom, room, username, userid, deck)
    {
        if (pRoom === null)
        {
            console.log("Game room does not exist: " + room);
            return false;
        }

        /* if the given player (its username) is already in the room, 
         * we do not need to add them and their deck. */
        if (this._playerIsInRomm(pRoom, userid))
            return true;

        if (!pRoom.game.joinGame(username, userid, deck))
        {
            console.log("Could not add player " + username + " to game " + room);
            return false;
        } 
        else
        {
            console.log("Player " + username + " added to game " + room + ". Waiting for all players to arrive.");
            return true;
        }
    },

    kickPlayer: function (userId, room, forceClose)
    {
        let pRoom = this._getRoom(room);
        if (pRoom === null)
            return;

        var _player;
        for (var i = 0; i < pRoom.players.length; i++)
        {
            _player = pRoom.players[i];
            if (_player.id !== userId)
                continue;

            pRoom.players.splice(i, 1);
            if (_player.socket !== null && forceClose === true)
            {
                _player.socket.leave(_player.socket.room);
                _player.socket.disconnect(true);
                _player.socket = null;
            }

            break;
        }
        
        if (typeof pRoom.socketids[userId] !== "undefined")
            delete pRoom.socketids[userId];
    },

    isEmptyRoom: function (room)
    {
        let pRoom = this._getRoom(room);
        return pRoom === null ? true : pRoom.players.length === 0;
    },
    
    countPlayersInRoom: function (room)
    {
        let pRoom = this._getRoom(room);
        return pRoom === null ? 0 : pRoom.players.length;
    },
    countExpectedPlayersInRoom: function (room)
    {
        let pRoom = this._getRoom(room);
        return pRoom === null ? 0 : pRoom.expectplayers;
    },

    /**
     * Add a player to a game list and force disconnect any other player
     * with the same name to avoid game confusion
     * 
     * @param {String} username
     * @param {String} room
     * @param {Object} socket
     * @return {Boolean}
     */
    addPlayerToGameList: function (userid, username, room, socket)
    {
        this.kickPlayer(userid, room, true);

        let pRoom = this._getRoom(room);
        if (pRoom === null)
            return false;

        /* join the romm and add socket/player to list */
        socket.join(room);
        pRoom.players.push({name: username, id : userid, socket: socket});
        pRoom.socketids[userid] = socket.id;
        return true;
    },
    
    hasAlreadyRejoined : function(userid, room, socketid)
    {
        let pRoom = this._getRoom(room);
        return pRoom !== null && typeof pRoom.socketids[userid] !== undefined && pRoom.socketids[userid] === socketid;
    },

    removePlayerFromGameList: function (socket)
    {
        if (this.hasAlreadyRejoined(socket.userid, socket.room, socket.id))
        {
            this.kickPlayer(socket.userid, socket.room, false);
            return true;
        }
        else 
        {
            console.log(socket.username + " has already rejoined and will not be kicked, consequently.");
            return false;
        }
    },

    /**
     * Add a player to a given game room
     * 
     * @param {String} userid
     * @param {String} username
     * @param {String} room
     * @param {Object} socket
     * @return {Boolean}
     */
    joinGame: function (userid, username, room, socket)
    {
        this.addPlayerToGameList(userid, username, room, socket);
    },

    /**
     * Player rejoined the table
     * 
     * @param {type} id
     * @param {type} socket
     * @return {undefined}
     */
    rejoinAfterBreak: function (userid, username, room, socket)
    {
        let pRoom = this._getRoom(socket.room);
        if (pRoom === null)
            return false;
        
        socket.userid = userid;
        socket.username = username;
        socket.room = room;
        
        console.log("User " + username + " rejoined " + socket.room + " the game " + room);
        this.addPlayerToGameList(userid, username, socket.room, socket);

        pRoom.api.initGameEndpoint(socket);

        /** set single player */
        if (pRoom.game.isSinglePlayer())
            pRoom.api.reply("/game/inform-type", socket, { type: "single" });
        else
            pRoom.api.reply("/game/inform-type", socket, { type: "multi" });

        /* draw cards and prepare hand */
        pRoom.game.inits.startPoolPhaseByPlayer(userid);

        /* draw board and restore the game table */
        pRoom.api.reply("/game/rejoin/immediately", socket, pRoom.game.getCurrentBoard(userid));
        pRoom.chat.sendMessage(userid, " joined the game.");
        pRoom.api.publish("/game/player/indicator", "", { userid : userid, connected: true });

    },

    /**
     * All players arrive at the waiting room, so send the message
     * to load their tables and shutdown the waiting room
     * 
     * @param {String} room
     * @return {void}
     */
    onProceedToGame: function (room, g_pLobbyManager)
    {
        var pGame = g_pLobbyManager.getGame(room);
        if (pGame === null)
        {
            console.log("cannot find game " + room);
            return;
        }
        
       /* so the room is created */
       let sGameType = pGame.players.length === 1 ? "singleplayer" : "multiplayer";
       var pRoom = GameManager.registerGame(pGame.room, pGame.players.length, sGameType);
       
        /**
         * Notify waiting players that game is ready. They will then proceed to the
         * game table and reconnect using a "rejoin" command
         */
        let _listGamer = [];
        let _listLoose = [];

        let _player;
        let nPlayers = pGame.players.length;
        for (var i = 0; i < nPlayers; i++)
        {
            _player = g_pLobbyManager.getPlayer(pGame.players[i]);
            if (_player === null)
                continue;
            
            if (GameManager.addPlayerToGameRoom(pRoom, room, _player.name, _player.id, _player.deck))
                _listGamer.push(_player.socket);
            else
                _listLoose.push(_player.socket);
            
            g_pLobbyManager.removeGame(_player.id);
            g_pLobbyManager.leave(_player.id);
        }
        
        /* close other */
        for (var i = 0; i < _listLoose.length; i++)
            _listLoose[i].disconnect('generic problem');

        for (var i = 0; i < _listGamer.length; i++)
            _listGamer[i].emit("/join/completed", { room: pGame.room });

        console.log(nPlayers + " player(s) arrived at game " + room + " - game will start now.");
    },

    sendFinalScore: function (socket, room)
    {
        let pRoom = typeof room === "undefined" ? null : GameManager._getRoom(room);
        if (pRoom !== null)
            pRoom.api.publish("/game/score/final", "", pRoom.game.getFinalScore());
    },
    
    leaveGame: function (userid, room)
    {
        if (typeof userid === "undefined" || typeof room === "undefined")
            return;

        let pRoom = GameManager._getRoom(room);
        if (pRoom !== null)
            pRoom.chat.sendMessage(userid, "left the game.");
    },

    checkGameContinuence : function(room) /* wait one minute to check if a room only has one player */
    {
        setTimeout(function ()
        {
            let nSec = 0;
            let bEndGame = false;
            if (GameManager.isEmptyRoom(room))
            {
                console.log("Game room " + room + " is empty and can be destroyed.");
                bEndGame = true;
            }
            else
            {
                let nActive = GameManager.countPlayersInRoom(room);
                let nExpcted = GameManager.countExpectedPlayersInRoom(room);
                
                if (nActive === 1 && nExpcted > 1)
                {
                    nSec = 2;
                    bEndGame = true;
                    GameManager.sendFinalScore(null, room);
                }
                else
                    console.log("There are " + nActive + "/" + nExpcted + " player(s) in game " + room);
            }

            if (bEndGame)
                GameManager.endGameInSeconds(nSec, room);
        }, 1000 * 60);
        
        console.log("Allowing player to reconnect for 1min before checking if the game can proceed or not.");
    },
    
    endGameInSeconds : function(nSec, room)
    {
        if (nSec < 1)
            GameManager.endGame(room);
        else
            setTimeout(function ()
            {
                GameManager.endGame(room);
            }, nSec * 1000);
    },
    
    onPlayerLeft : function(room, userid)
    {
        let pRoom = this._getRoom(room);
        if (pRoom === null)
            return;
        
        if (!GameManager.isEmptyRoom(room))
        {
            pRoom.api.publish("/game/player/indicator", userid, { userid : userid, connected: false });
            pRoom.chat.sendMessage(userid, "has left.");
        }
        else
            this.checkGameContinuence(room);
    },
    
    /**
     * End a game and disconnect all remaining players
     * 
     * @param {String} room
     * @return {void}
     */
    endGame: function (room)
    {
        let pRoom = this._getRoom(room);
        if (pRoom === null)
            return;

        pRoom.chat.sendMessage("Game", "has ended.");

        let _list = pRoom.players;
        pRoom.players = [];

        this.destroyGame(room);

        var _player;
        for (var i = 0; i < _list.length; i++)
        {
            _player = _list[i];
            if (_player.socket !== null)
            {
                _player.socket.leave(_player.socket.room,);
                _player.socket.disconnect(true);
                _player.socket = null;
            }
        }

        console.log("Game " + room + " has ended.");
    },

    onNewMessage: function (socket, message)
    {
        try
        {
            if (message.indexOf("<") !== -1 || message.indexOf(">") !== -1 || message.trim() === "")
                return;
                
            let pRoom = message === "" ? null : this._getRoom(socket.room);
            if (pRoom !== null)
                pRoom.chat.sendMessage(socket.userid, message.trim());
        }
        catch (err) 
        {
        }
    },
    
    onNewMessageLobby: function (message)
    {
        try
        {
            if (this._io != null && message.indexOf("<") === -1 && message.indexOf(">") === -1 && message.trim() !== "")
                this._io.emit("/messages/chat", message.trim());
        }
        catch (err) 
        {
        }
        
    }
};
