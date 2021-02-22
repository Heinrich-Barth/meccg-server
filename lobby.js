
module.exports = {
    
    createLobby: function ()
    {
        return new LobbyManager();
    }
};

class LobbyManager {
    
    _active = { };
    _activeSimple = { };
    _games = { };

    constructor()
    {
    }
    
    isAlphaNumeric(sInput)
    {
        return typeof sInput !== "undefined" && sInput.trim() !== "" && /^[0-9a-zA-Z]{1,}$/.test(sInput);
    }
    
    /**
     * Get the target game room and vaildate it
     * @param {json} data
     * @return {String} target room or the common game room if not set
     */
    _getTargetGameRoom(room)
    {
        if (room.length > 0 && this.isAlphaNumeric(room))
            return room;
        else
            return "room" + new Date().getTime();;
    }

    createActive(id, name, socket)
    {
        return { 
            id : id,
            name: name,
            deck: null,
            login : new Date().getTime(),
            socket : socket
        };
    }
    
    getGame(id)
    {
        if (typeof this._games[id] !== "undefined")
            return this._games[id];
        else
            return null;
    }
    
    /**
     * Add a player to the lobby
     * @param {type} id
     * @param {type} name
     * @return {void}
     */
    add(id, name, socket)
    {
        if (id !== "" && name !== "")
        {
            this._active[id] = this.createActive(id, name, socket);
            this._activeSimple[id] = name;
        }
    }
    
    addPlayerDeck(id, deck, gameId)
    {
        if (typeof this._games[gameId] === "undefined")
            return "";
        
        if (!this._games[gameId].players.includes(id))
            this._games[gameId].players.push(id);
        
        if (typeof this._active[id] !== "undefined")
            this._active[id].deck = deck;
        
        return gameId;
    }

    /**
     * Create a game room 
     * @param {type} id
     * @param {type} secret
     * @return {String} game id
     */
    createGame(id, room, secret)
    {
        /* player is not active */
        if (typeof this._active[id] === "undefined" || typeof this._games[id] !== "undefined")
            return "";
        
        /* create a game room */
        let sRoomId = this._getTargetGameRoom(room);
        this._games[sRoomId] = {
            created: new Date().getTime(),
            players : [id],
            room: sRoomId,
            secret: secret
        };
        
        console.log("Game waiting room " + room + " now open for gamers to join.");
        console.log(id + " joined this room already.");
        
        return sRoomId;
    }
    
    /**
     * Join a game
     * @param {type} gameId
     * @param {type} id
     * @return {Boolean}
     */
    joinGame(gameId, id)
    {
        if (typeof gameId === "undefined" || typeof id === "undefined" || gameId === "" || id === "")
            return false;
        
        if (typeof this._games[gameId] !== "undefined")
            return false;
        
        if (!this._games[gameId].players.includes(id))
            this._games[gameId].players.push(id);
        
        return true;        
    }
    
    leave(id, gameId)
    {
        if (id !== "" && typeof this._active[id] !== "undefined")
        {
            console.log(this._activeSimple[id] + " let the lobby.");
            
            delete this._active[id];
            delete this._activeSimple[id];
        }
    }
    
    getPlayer(id)
    {
        if (id !== "" && typeof this._active[id] !== "undefined")
            return this._active[id];
        else
            return null;
    }
    
    getOnline()
    {
        return {
            online : this._activeSimple,
            games : this._games
        };
    }

    getGames()
    {
        return this._games;
    }
    
    removeGame(id)
    {
        if (typeof this._games[id] !== "undefined")
        {
            delete this._games[id];
            console.log("game waiting room " + id + " shutdown.");
        }
    }
};