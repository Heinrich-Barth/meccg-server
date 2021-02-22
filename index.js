/**
 * MECCG Game Server
 * 
 * This server simply accepts incomming socket.io connections
 * and requires authentication via access token generation
 * and hash calculation requests
 * 
 * Thereafter, users may go to the lobby and proceed to the game
 * from there.
 * 
 * The server keeps itself alive every 20mins.
 * The settings are to be found at the botto of this file
 */

const fs = require('fs');

let HTTP_SERVER = { };

HTTP_SERVER._server = null;
HTTP_SERVER._io = null;
HTTP_SERVER._LobbyManager = null;
HTTP_SERVER._GameManager = null;
HTTP_SERVER._authenticationManagement = null;

HTTP_SERVER.shutdown = function ()
{
    console.log(" ");
    console.log("Shutting down game server.");

    if (this._io !== null) try
    {
        console.log("- shutdown IO http server.");
        this._io.httpServer.close();

        console.log("- shutdown IO.");
        this._io.close();

        this._io = null;
    }
    catch(errIgnore)
    {

    }

    if (this._server !== null) try
    {
        console.log("- shutdown server.");
        this._server.close();
        this._server = null;
    }
    catch(errIgnore)
    {

    }

    console.log("- stop application.");
    process.exit(0);
};

HTTP_SERVER.onIoConnection = function(socket)
{
    console.log("New connection " + socket.id);

    socket.auth = false;
    socket.userid = "";
    socket.username = "";

    if (HTTP_SERVER._authenticationManagement !== null)
        HTTP_SERVER._authenticationManagement.triggerAuthenticationProcess(socket);

    socket.on("disconnect", () =>
    {
        if (!socket.auth)
        {
            console.log("Disconnected unauthenticated session.");
            return;
        }
        
        HTTP_SERVER._LobbyManager.leave(socket.userid, socket.gameJoind);
        HTTP_SERVER._LobbyManager.removeGame(socket.gameJoind);

        if (socket.isingame === true)
        {
            /* speed race possible - */
            if (HTTP_SERVER._GameManager.removePlayerFromGameList(socket))
            {
                HTTP_SERVER._GameManager.onPlayerLeft(socket.room, socket.userid);
                console.log(socket.username + " removed from game " + socket.room);
            }
        }
        
        if (socket.username !== "")
            console.log(socket.username + " disconnected.");
    });
    
    /**
     * Destroy session if not authenticated within 1second after connection
     * @return {void}
     */
    setTimeout(function ()
    {
        if (!socket.auth)
        {
            console.log("Disconnecting socket " + socket.id + " due to missing authentication.");
            socket.disconnect('unauthorized');
        }

    }, 1000 * 60 * 2);
};

HTTP_SERVER.onListening = function()
{
    HTTP_SERVER._io.on('connection', HTTP_SERVER.onIoConnection);

    console.log("This game server is up and awaiting games.");
};

HTTP_SERVER._routes = { 

    get : {}, 
    post : {},

    _route404 : function(req, res) 
    {
        res.writeHead(404, {'Content-Type': 'text/plain'});
    },

    _readFile : function(sFile)
    {
        return fs.readFileSync("htdocs/" + sFile, "utf-8");
    }
};

HTTP_SERVER.addGet = function(route, callback)
{
    HTTP_SERVER._routes.get[route] = callback;
}

HTTP_SERVER.addGet("/", function(req, res) 
{
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(HTTP_SERVER._routes._readFile("index.html"));
});

HTTP_SERVER.addGet("/ping", function(req, res) 
{
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.write("Bless you, laddie.");    
});

HTTP_SERVER.onHttpRequest = function(req, res) 
{
    try
    {
        let url = req.url;
        if (typeof HTTP_SERVER._routes.get[url] !== "undefined")
            HTTP_SERVER._routes.get[url](req, res);
        else
            HTTP_SERVER._routes._route404(req, res);
    }
    catch (err)
    {
        res.statusCode = 500;
    }
    finally
    {
        res.end();
    }    
};



HTTP_SERVER.startServer = function(port, nKeepAliveMinutes)
{
    HTTP_SERVER._http = require('http');
    HTTP_SERVER._https = require('https');

    HTTP_SERVER._server = this._http.createServer(HTTP_SERVER.onHttpRequest);
    HTTP_SERVER._io = require('socket.io')(HTTP_SERVER._server);

    /** after authentication, new players enter the lobby  */
    HTTP_SERVER._LobbyManager = require("./lobby.js").createLobby();

    /** Starts a game and manages registration to it */
    HTTP_SERVER._GameManager = require("./gamemanager.js").create(this._io);

    HTTP_SERVER._authenticationManagement = require("./authentication.js").create(this._LobbyManager, this._GameManager);

    HTTP_SERVER._server.listen(port, HTTP_SERVER.onListening);

    if (nKeepAliveMinutes > 0)
    {
        console.log("Send a keep-alive every " + nKeepAliveMinutes + "min(s).");
        setInterval(HTTP_SERVER.keepAlive, 60000 * nKeepAliveMinutes);
    }
}

HTTP_SERVER.keepAliveError = function(err)
{
    console.log("Error: " + err.message);
};
HTTP_SERVER.keepAliveResponse = function(resp)
{
    console.log("Keep alive: ", resp.statusCode);
};

HTTP_SERVER.keepAlive = function()
{
    HTTP_SERVER._https.get("https://morning-waters-91256.herokuapp.com/ping", HTTP_SERVER.keepAliveResponse).on("error", HTTP_SERVER.keepAliveError);
};

/**
 * allow CTRL+C
 */
process.on('SIGTERM', HTTP_SERVER.shutdown);
process.on('SIGINT', HTTP_SERVER.shutdown);

HTTP_SERVER.startServer(process.env.PORT || 8080, 20);

