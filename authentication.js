
module.exports = {
    
    create: function (pLobbyManager, pGameManager)
    {
        g_pLobbyManager = pLobbyManager;
        g_pGameManager = pGameManager;

        return {
            triggerAuthenticationProcess : function(socket)
            {
                AuthenticationManagement.triggerAuthenticationProcess(socket);
            }
        }
    }
};

const crypto = require('crypto');
const getHash = (x, HASH_SALT) => crypto.createHash('sha256').update(HASH_SALT + x + HASH_SALT + "0", 'utf8').digest('hex');

let g_pLobbyManager = null;
let g_pGameManager = null;

function isAlphaNumeric(sInput)
{
    return typeof sInput !== "undefined" && sInput.trim() !== "" && /^[0-9a-zA-Z]{1,}$/.test(sInput);
}

const AuthenticationManagement = {

    _salt : "",
    
    createSalt : function()
    {
        if (this._salt === "")  
            this._salt = new Date().getTime() + Math.floor(Math.random() * Math.floor(1000)) + 1;
        
        return this._salt;
    },


    /**
     * Get the target game room and vaildate it
     * @param {json} data
     * @return {String} target room or the common game room if not set
     */
    getTargetGameRoom : function(room)
    {
        if (room.length > 0 && isAlphaNumeric(room))
            return room;
        else
            return commonRoom;
    },

    triggerAuthenticationProcess: function (socket)
    {
        /**
         * I expect a plain connection which is not in any way authenticated.
         * Authentication works like this:
         *  a) connect
         *  b) receive a plain input
         *  c) reply to connection with /authenticate and send plain input
         *  d) await reply at /authenticate with hased input. 
         *  
         *  If d) is correct, the connection remains intact. It will be destroyed
         *  automatically after 1second after connection
         */
        socket.secret = this.createSalt();
        socket.authenticate_input = "" + new Date().getTime();
        socket.authenticate_expect = getHash("" + socket.authenticate_input, socket.secret);
        socket.allow_deck = false;
        socket.room = "";
        socket.leavewaitingroom = false;
        socket.isingame = false;
        socket.gameJoind = "";

        /**
         * if the user/application authenticates correctly, we grant permission to send the deck
         * and their username
         * 
         * The user will receive /authenticate/success
         */
        socket.on("/authenticate", (data) =>
        {
            console.log("Authentication request received.");
            if (data.token !== socket.authenticate_expect)
            {
                socket.disconnect("token missmatch");

                console.log("Token missmatch. Will not authenticate player.");
                return;
            }
            else
                AuthenticationManagement._addGenericRoutes(socket);
            
            socket.auth = true;
            socket.allow_deck = true;
            
            console.log("Authentication succeeded.");
            socket.emit("/authenticate/success", {});
        });

        socket.on("/authenticate/start", () =>
        {
            /**
             * request the player to authenticate before anything else is possible.
             * If the authentication is successful, all other endpoints will be setup
             * and made available to the given socket.
             */
            console.log("send authentication request");
            socket.emit("/authenticate", {input: socket.authenticate_input, salt: socket.secret});
        });
    },

    _onRejoinRunningGame: function (socket, data)
    {
        if (!isAlphaNumeric(data.username) || !isAlphaNumeric(data.userid))
            return false;

        socket.username = data.username;
        socket.userid = data.userid;
        socket.room = AuthenticationManagement.getTargetGameRoom(data.room);
        return true;
    },

    /**
     * Add player to a waiting room and save their deck
     * 
     * @param {type} socket
     * @param {type} data
     * @return {void}
     */
    _joinLobby(socket, data)
    {
        if (!isAlphaNumeric(data.username) || !isAlphaNumeric(data.userid))
        {
            socket.auth = false;
            socket.disconnect('user');

            console.log("Invalid username or user id provided.");
        }
        else
        {
            socket.userid = data.userid;
            socket.username = data.username;
            
            g_pLobbyManager.add(data.userid, data.username, socket);
        }
    },

    /**
     * Add player to a waiting room and save their deck
     * 
     * @param {type} socket
     * @param {type} data
     * @return {void}
     */
    _joinAndAwaitPlayersToArrive(socket, data, bStart)
    {
        if (!isAlphaNumeric(data.username) || !isAlphaNumeric(data.userid))
        {
            socket.auth = false;
            socket.disconnect('user');

            console.log("Invalid username or user id provided.");
            return "";
        }
        else if (data.room.length < 2)
        {
            console.log("invalid game room detected.");
            socket.auth = false;
            socket.disconnect('room');
            return "";
        }  

        /* set player deck in their map */
        let sRoomJoined = g_pLobbyManager.addPlayerDeck(data.userid, data.deck, data.room);
        if (sRoomJoined === "")
        {
            console.log("Could not join nonexisting game");
            return;
        }
        
        socket.gameJoind = sRoomJoined;
        
        /* if this was the last player to arrive in the waiting room, we can proceed to the game */
        if (bStart)
        {
            const _room = data.room;
            setTimeout(function ()
            {
                g_pGameManager.onProceedToGame(_room, g_pLobbyManager);
            }, 2000);
        }
    },

    /**
     * Add generic routes to a socket
     * @param {Object} socket
     * @return {void}
     */
    _addGenericRoutes: function (socket)
    {
        // when the client emits 'new message', this listens and executes
        socket.on("/game/chat/message", (data) => {
            g_pGameManager.onNewMessage(socket, data);
        });
        
        socket.on("/messages/chat", (data) => {
            g_pGameManager.onNewMessageLobby(data);
        });

        socket.on("/game/finalscore", () =>  {
            g_pGameManager.sendFinalScore(socket, socket.room);
        });
        
        socket.on("/game/quit", () => {
            g_pGameManager.leaveGame(socket.userid, socket.room);
            g_pGameManager.endGame(socket.room);
        });

        // rejoin with a previously existing connection
        socket.on('/game/rejoin/immediately', (data) =>
        {
            if (!AuthenticationManagement._onRejoinRunningGame(socket, data))
            {
                socket.auth = false;
                socket.disconnect();
                return;
            }
            else
                g_pGameManager.rejoinAfterBreak(data.userid, data.username, data.room, socket);
        });

        /**
         * Player is now at their table
         */
        socket.on('/game/rejoin', (data) => {

            if (!isAlphaNumeric(data.username))
            {
                console.log("invalid user name tries to connect to a running game.");
                return;
            }

            let room = AuthenticationManagement.getTargetGameRoom(data);

            socket.userid = data.userid;
            socket.username = data.username;
            socket.room = room;

            console.log(data.username + " joined the table " + room);
        });
        
        socket.on('/game/player/isalive', () => { });
        socket.on('/game/player/time', () => { });

        /**
         * so this is the first time a player joins the actual game.
         */
        socket.on("/game/join", (data) =>
        {
            AuthenticationManagement._joinAndAwaitPlayersToArrive(socket, data, false);
        });
        /**
         * so this is the first time a player joins the actual game.
         */
        socket.on('/game/start', (data) =>
        {
            AuthenticationManagement._joinAndAwaitPlayersToArrive(socket, data, true);
        });
        
        /**
         * so this is the first time a player joins the actual game.
         */
        socket.on("/lobby/join", (data) =>
        {
            AuthenticationManagement._joinLobby(socket, data);
        });

        socket.on("/lobby/player/list", (data) =>
        {
            socket.emit('/lobby/player/list', g_pLobbyManager.getOnline() );
        });

        socket.on("/lobby/game/create", (data) =>
        {
            let room = data.room;
            socket.gameJoind = g_pLobbyManager.createGame(room, room, socket.secret);
        });
        
        socket.on("/lobby/game/start", (data) =>
        {
            let room = data.room;
            if (typeof room === "undefined" || room === "")
                return;
            
            AuthenticationManagement._joinAndAwaitPlayersToArrive(socket, data, true);
        });
    }
};
