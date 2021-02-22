

module.exports = {
    
    game: function (_MeccgApi, _Chat, _gameType)
    {
        let _inst = newInstanceGame(_MeccgApi, _Chat, _gameType);
        _inst.init(require("./playboard-management.js").setup(_gameType));
        return _inst;
    }
};

function newInstanceGame(_MeccgApi, _Chat, _gameType)
{
    const g_Chat = _Chat;
    const g_MeccgApi = _MeccgApi;
    const g_crypto = require('crypto');
    
    /* create a hash using a given salt */
    function createHashFromData(jData, sSalt)
    {
        let sVal = JSON.stringify(jData, null, '\t');
        let pHash = g_crypto.createHash('sha512');
        return pHash.update(sSalt + sVal + sSalt + "SAUsack", 'utf8').digest('hex');
    }
    
    /* simply create a random hex string */
    function createUuid()
    {
        return g_crypto.randomBytes(50).toString("hex") ;
    }

    /**
     * Send a new card to the FRONTEND GUI hand list
     * @param {String} player
     * @param {String} uuid
     * @param {String} code
     * @param {String} type
     * @param {Integer} count
     * @returns {void}
     */
    function drawCard(playerid, uuid, code, type, count)
    {
        g_MeccgApi.publish("/game/card/draw", playerid, {code: code, uuid: uuid, count: count, type: type, owner: ""});
    }

    const Game =
    {
        player_phase: "start",

        started : null,

        _playboardManager: null,

        reset: function ()
        {
            if (Game._playboardManager !== null)
                Game._playboardManager.reset();

            Game.player_phase = "start";
            Game.players.this_player = "";
            Game.players.ids = [];
            Game.players.current = 0;
            Game.players.turn = 1;
            Game.scoring.reset();
            Game.started = 0;
        },

        scoring : require("./scores.js").create(),

        players: {

            this_player_name: "",
            this_player: "",
            ids: [],
            names: {},
            current: 0,
            turn: 1,

            registerThisPlayer: function (sId, sName)
            {
                this.this_player = sId;
                this.this_player_name = sName;
                this.addOpponent(sId, sName);
            },

            addOpponent: function (sId, sName)
            {
                Game.players.ids.push(sId);
                Game.players.names[sId] = sName;
                Game.scoring.add(sId);
            },

            getCurrent: function ()
            {
                return Game.players.ids[Game.players.current];
            },

            getCurrentPlayerName: function ()
            {
                return Game.players.names[Game.players.getCurrent()];
            },

            moveNext: function ()
            {
                Game.players.current++;
                if (Game.players.current >= Game.players.ids.length)
                {
                    Game.players.turn++;
                    Game.players.current = 0;
                }

                return Game.players.getCurrent();
            },

            currentIsMe: function ()
            {
                return this.getCurrent() === this.this_player;
            },

            getAll: function ()
            {
                return this.ids;
            },

            getCount : function()
            {
                return this.ids.length
            },

            getNameMap: function ()
            {
                return this.names;
            }
        },

        isSinglePlayer : function()
        {
            return Game.players.getCount() == 1;
        },

        isMyTurn: function ()
        {
            return Game.players.currentIsMe();
        },

        nextPlayersTurn: function ()
        {
            return Game.players.moveNext();
        },

        getPhase: function ()
        {
            return this.player_phase;
        },
        
        getGameOnline : function()
        {
            if (this.started === null)
            {
                this.started = new Date();
                return 0;
            }
            else
                return new Date().getTime() - this.started;
        },

        setPhase: function (sVal)
        {
            this.player_phase = sVal;
        },

        dumpDeck: function ()
        {
            for (var key in this.players.ids)
                this._playboardManager.DumpDeck(this.players.ids[key]);
        },


        saveCurrentGame: function ()
        {
            return {
                players: {
                    phase: Game.players.player_phase,
                    ids: Game.players.ids,
                    names: Game.players.names,
                    current: Game.players.current,
                    turn: Game.players.turn,
                    score: Game.scoring.getScoreSheets()
                },
                phase: Game.player_phase,
                board: Game._playboardManager.SaveCurrentGame()
            };
        },

        /**
         * 
         * @param {type} jData
         * @return {boolean} success
         */
        restoreSavedGame: function (jData)
        {
            return false;
        },

        getFinalScore: function ()
        {
            return Game.scoring.getScoreSheets();
        },

        setupNewGame: function ()
        {
            return this._cardMangagementFactory !== null;
        },

        joinGame: function (playerName, playerId, cards)
        {
            if (cards === null || playerName === "" || playerId === "" || !this.setupNewGame())
                return false;
            else
            {
                this.players.addOpponent(playerId, playerName);
                return this._playboardManager.AddDeck(playerId, cards);
            }
        },

        addCardsToGameDuringGame: function (playerId, cards)
        {
            return this._playboardManager.AddDeckCardsToSideboard(playerId, cards);
        },

        getCurrentTurn: function ()
        {
            return Game.players.turn;
        },

        updateHandCountersPlayerAll: function ()
        {
            var list = Game.players.getAll();
            for (var i = 0; i < list.length; i++)
                Game.updateHandCounterPlayerOnly(list[i]);
        },

        updateHandCounterPlayerOnly: function (player)
        {
            var sizeHand = Game._playboardManager.Size.hand(player);
            var sizePlaydeck = Game._playboardManager.Size.playdeck(player);
            var sizeSideboard = Game._playboardManager.Size.sideboard(player);
            var sizeDiscard = Game._playboardManager.Size.discard(player);
            var sizeDiVictory = Game.scoring.getPlayerScore(player);

            g_MeccgApi.publish("/game/update-deck-counter/player/generics", player, {
                playdeck: sizePlaydeck,
                sideboard: sizeSideboard,
                discard: sizeDiscard,
                hand: sizeHand,
                victory: sizeDiVictory,
                player: player
            });
        },

        updateHandCountersPlayer: function (player)
        {
            if (typeof player === "undefined")
                player = Game.players.getCurrent();

            Game.updateHandCounterPlayerOnly(player);
            Game.updateHandCounterOnlyPlayer(player);
        },

        updateHandCounterOnlyPlayer: function (player)
        {
            var sizeHand = Game._playboardManager.Size.hand(player);
            var sizePlaydeck = Game._playboardManager.Size.playdeck(player);
            var nScore = Game.scoring.getPlayerScore(player);

            g_MeccgApi.publish("/game/update-deck-counter/player/hand", player, {
                hand: sizeHand, 
                playdeck: sizePlaydeck,
                score : nScore,
                player: player
            });
        },

        removeEmptyCompanies: function ()
        {
            const keys = Game._playboardManager.removeEmptyCompanies();
            if (keys.length === 0)
                return false;

            g_MeccgApi.publish("/game/remove-empty-companies", "", keys);
            Game.updateHandCountersPlayerAll();
            return true;
        },

        getCurrentBoard: function (id)
        {
            var data = {
                player: {
                    companies: [],
                    stage_hazards: [],
                    stage_resources: []
                },
                opponent: {
                    companies: [],
                    stage_hazards: [],
                    stage_resources: []
                }
            };

            var _dataTarget;
            var _playerId, _list, _temp, card;

            var players = Game.players.getAll();
            for (var i = 0; i < players.length; i++)
            {
                _playerId = players[i];
                if (_playerId === id)
                    _dataTarget = data.player;
                else
                    _dataTarget = data.opponent;

                _list = Game._playboardManager.GetCompanyIds(_playerId);
                for (var y = 0; y < _list.length; y++)
                {
                    _temp = Game._playboardManager.GetFullCompanyByCompanyId(_list[y]);
                    if (_temp !== null)
                        _dataTarget.companies.push(_temp);
                }

                _list = Game._playboardManager.GetStagingCards(_playerId, true);
                for (var y = 0; y < _list.length; y++)
                {
                    card = Game._playboardManager.GetCardByUuid(_list[y]);
                    _dataTarget.stage_resources.push({uuid: card.uuid, target: "", code: card.code, type: card.type.toLowerCase(), state: card.state, revealed: card.revealed, owner: card.owner});
                }

                _list = Game._playboardManager.GetStagingCards(_playerId, false);
                for (var y = 0; y < _list.length; y++)
                {
                    card = Game._playboardManager.GetCardByUuid(_list[y]);
                    _dataTarget.stage_hazards.push({uuid: card.uuid, target: "", code: card.code, type: card.type.toLowerCase(), state: card.state, revealed: card.revealed, owner: card.owner});
                }

                Game.updateHandCountersPlayer(_playerId);
            }

            Game.inits.sendCurrentPhase();
            return data;
        },

        inits: {

            startPoolPhaseByPlayer: function (id)
            {
                var _list = Game._playboardManager.GetCardsInHand(id);
                for (var i = 0; i < _list.length; i++)
                    drawCard(id, _list[i].uuid, _list[i].code, _list[i].type, 1);

                Game.updateHandCountersPlayer(id);
            },

            sendPlayerList: function ()
            {
                let userid = Game.players.getCurrent();
                let jMap = Game.players.getNameMap();
                g_MeccgApi.publish("/chat/set-player-names", userid, jMap);
                g_MeccgApi.publish("/game/time", userid, { time : Game.getGameOnline() });
            },

            sendCurrentPhase: function ()
            {
                Game.inits.sendPlayerList();

                var userid = Game.players.getCurrent();
                const data = {
                    phase: Game.getPhase(),
                    currentplayer: userid,
                    players: Game.players.getAll()
                };

                g_MeccgApi.publish("/game/set-phase", userid, data);
            },

            sendCurrentHandSize: function ()
            {
                var userid = Game.players.getCurrent();
                let nSize = Game._playboardManager.Size.hand(userid);
                g_Chat.send(userid, " holds " + nSize + " card(s)");
            },

            startPoolPhase: function ()
            {
                var vsPlayers = Game.players.getAll();
                for (var id of vsPlayers)
                    Game.inits.startPoolPhaseByPlayer(id);
                Game.inits.sendCurrentPhase();
            }
        },

        callbacks: {

            onStagingAreaAddCard: function (userid, socket, data)
            {
                var _uuid = data.uuid;

                if (!Game._playboardManager.MoveCardToStagingArea(_uuid, userid, userid))
                {
                    g_Chat.send(userid, "Cannot move card to staging area");
                    return false;
                }

                var card = Game._playboardManager.GetCardByUuid(_uuid);
                var type = card.type;

                g_MeccgApi.publish("/game/remove-card-from-hand", "", _uuid);
                g_MeccgApi.publish("/game/add-to-staging-area", userid, {uuid: _uuid, target: "", code: card.code, type: type, state: card.state, revealed: card.revealed, owner: card.owner});
                Game.updateHandCountersPlayer(userid);
                g_Chat.send(userid, "added " + card.code + " to staging area");
            },

            card: {

                onGameCardStateReveal: function (userid, socket, data)
                {
                    const uuid = data.uuid;
                    const rev = Game._playboardManager.FlipCard(uuid);

                    g_MeccgApi.publish("/game/card/reveal", userid, {uuid: uuid, reveal: rev});

                    if (rev)
                        g_Chat.send(userid, " reveals " + data.code);
                    else
                        g_Chat.send(userid, " hides a card");
                },

                onGameCardStateSet: function (userid, socket, data)
                {
                    if (data.uuid === "_site")
                    {
                        data.tapped = data.state === 90;
                        data.ownerId = userid;
                        Game._playboardManager.SetSiteState(userid, data.code, data.state);
                        g_MeccgApi.publish("/game/card/state/set-site", userid, data);
                    }
                    else
                    {
                        Game._playboardManager.SetCardState(data.uuid, data.state);
                        g_MeccgApi.publish("/game/card/state/set", userid, data);
                    }

                    const nState = data.state;
                    var message = "turns ";
                    if (nState === 0)
                        message = "untaps ";
                    else if (nState === 90)
                        message = "taps ";
                    else if (nState === 91)
                        message = "fixed ";
                    else if (nState === 180)
                        message = "wounds ";

                    g_Chat.send(userid, message + data.code);
                },

                onGameStateGlow: function (userid, socket, data)
                {
                    g_MeccgApi.publish("/game/card/state/glow", userid, data);
                    g_Chat.send(userid, "marks/unmarks " + data.code);
                },

                onCardDraw: function (userid, socket, obj)
                {
                    var _list = Game._playboardManager.GetCardsInHand(userid);
                    for (var i = 0; i < _list.length; i++)
                        drawCard(userid, _list[i].uuid, _list[i].code, _list[i].type, 1);

                    Game.updateHandCountersPlayer(userid);

                    if (_list.length === 1)
                        g_Chat.send(userid, "drew 1 card");
                    else if (_list.length > 1)
                        g_Chat.send(userid, "drew " + _list.length + " cards");
                },

                onCardDrawSingle: function (userid, socket, obj)
                {
                    var _card = Game._playboardManager.DrawCard(userid, false);
                    if (_card === null)
                        return;

                    Game.updateHandCountersPlayer(userid);
                    drawCard(userid, _card.uuid, _card.code, _card.type, 1);
                    g_Chat.send(userid, "drew 1 card");
                },

                onGetTopCardFromHand: function (userid, socket, nCount)
                {
                    if (nCount < 1)
                        return;

                    var _card;
                    var _cards = Game._playboardManager.GetTopCards(userid, nCount);
                    for (var i = 0; i < _cards.length; i++)
                    {
                        _card = _cards[i];
                        drawCard(userid, _card.uuid, _card.code, _card.type, nCount);
                        g_Chat.send(userid, "drew 1 card");
                    }
                },

                onCardStore: function (userid, socket, obj)
                {
                    var card = Game._playboardManager.GetCardByUuid(obj.uuid);
                    if (card === null)
                        return;

                    card.owner = userid;

                    var nStored = 0, nDiscarded = 0;

                    var list = [];
                    if (card.type !== "character")
                    {
                        if (Game._playboardManager.MoveCardTo(obj.uuid, card.owner, "victory"))
                        {
                            nStored++;
                            list = [obj.uuid];
                        }
                    } 
                    else
                    {
                        var _remove = [];
                        var _uuid;
                        list = Game._playboardManager.PopCharacterAndItsCards(obj.uuid);

                        for (var i = 0; i < list.length; i++)
                        {
                            _uuid = list[i];
                            if (_uuid === obj.uuid)
                            {
                                if (Game._playboardManager.AddToPile(_uuid, card.owner, "victory"))
                                {
                                    nStored++;
                                    _remove.push(_uuid);
                                }
                            } 
                            else if (Game._playboardManager.AddToPile(_uuid, card.owner, "discard"))
                            {
                                nDiscarded++;
                                _remove.push(_uuid);
                            }
                        }

                        list = _remove;
                    }

                    if (nStored !== 0)
                    {
                        g_MeccgApi.publish("/game/card/remove", userid, list);
                        Game.updateHandCountersPlayerAll();

                        g_Chat.send(userid, "Stores " + card.code);
                        if (nDiscarded > 0)
                            g_Chat.send(userid, "... and discarded " + nDiscarded + " card(s)");
                    } 
                    else
                        g_Chat.send(userid, "Could not store " + card.code);
                },

                onCardMove: function (userid, socket, obj)
                {
                    var drawTop = obj.drawTop;
                    var card = Game._playboardManager.GetCardByUuid(obj.uuid);
                    if (card === null)
                        return;

                    var list = [];
                    if (card.type !== "character" || obj.source !== "inplay")
                    {
                        /**
                         * the victory pile is different: usually, the target of your deck pils is always the card owner,
                         * yet the victory condition allows to take ownership of cards
                         */
                        let _targetPlayer = obj.target === "victory" ? userid : card.owner;
                        if (Game._playboardManager.MoveCardTo(obj.uuid, _targetPlayer, obj.target))
                            list = [obj.uuid];
                    } 
                    else
                        list = Game._playboardManager.MoveCardCharacterTo(obj.uuid, card.owner, obj.target);

                    if (list.length > 0)
                    {
                        if (drawTop)
                            Game.callbacks.card.onGetTopCardFromHand(card.owner, socket, list.length);

                        Game.updateHandCountersPlayer(userid);
                    }

                    // now we have to remove the cards from the board again
                    g_MeccgApi.publish("/game/card/remove", userid, list);
                    g_Chat.send(userid, "Moved " + list.length + " card(s) to " + obj.target);
                },

                onCardDiscard: function (userid, socket, data)
                {
                    var card = Game._playboardManager.GetCardByUuid(data.uuid);
                    if (card === null)
                        return false;

                    if (!Game._playboardManager.MoveCardTo(data.uuid, card.owner, "discardpile"))
                        return false;

                    Game.updateHandCountersPlayer(card.owner);

                    g_Chat.send(userid, "Discarded 1 card. Current hand size is " + Game._playboardManager.Size.hand(card.owner));
                    return true;
                }
            },

            score: {
                
                show: function (userid, socket, data)
                {
                    g_MeccgApi.reply("/game/score/show", socket, Game.scoring.getScoreSheets());
                    g_MeccgApi.reply("/game/score/show-pile", socket, Game.callbacks.view._getList(userid, "victory"));
                    g_Chat.send(userid, " looks at score sheet");
                },

                update: function (userid, socket, data)
                {
                    if (Game.scoring.updateScore(userid, data))
                    {
                        let total = Game.scoring.getPlayerScore(userid);
                        g_Chat.send(userid, " updates score to a total of " + total + " point(s)");
                    }
                    else
                        console.log("Could not update score.");
                },

                add: function (userid, socket, data)
                {
                    let total = Game.scoring.update(userid, data.type, data.points);
                    if (total !== null)
                        g_Chat.send(userid, " updated " + data.type + " score by " + data.points + " point(s) to a total of " + total + " MPs.");
                }
            },

            draw: {
                onGameDrawCompany: function (userid, socket, data)
                {
                    var pCompany = Game._playboardManager.GetFullCompanyByCompanyId(data);
                    if (pCompany !== null)
                    {
                        g_MeccgApi.publish("/game/player/draw/company", userid, pCompany);
                        Game.removeEmptyCompanies();
                    }
                },

                onGameDrawCompanies: function (userid, socket, data)
                {
                    var list = Game._playboardManager.GetCompanyIds(userid);
                    for (var i = 0; i < list.length; i++)
                        g_MeccgApi.publish("/game/player/draw/company", userid, Game._playboardManager.GetFullCompanyByCompanyId(list[i]));
                }
            },

            character: {

                onCharacterHostCard: function (userid, socket, obj)
                {
                    var uuid = obj.uuid;
                    var company = obj.companyId;
                    var character = obj.characterUuid;
                    var bFromHand = obj.fromHand;

                    if (!Game._playboardManager.CharacterHostCard(company, character, uuid, bFromHand, userid))
                    {
                        console.log("character cannot host card.");
                        return false;
                    }

                    var card = Game._playboardManager.GetCardByUuid(uuid);

                    g_MeccgApi.publish("/game/remove-card-from-hand", "", uuid);
                    g_MeccgApi.publish("/game/remove-card-from-board", "", uuid);
                    Game.updateHandCountersPlayer(userid);

                    {
                        let cardChar = Game._playboardManager.GetCardByUuid(character);
                        if (cardChar === null || cardChar.revealed === false)
                            g_Chat.send(userid, " character hosts " + card.code);
                        else
                            g_Chat.send(userid, cardChar.code + " hosts " + card.code);
                    }

                    return true;
                },

                onCharacterReceiveCard: function (userid, socket, obj)
                {
                    /** deprecated */
                    /*
                    var sourceCharacter = obj.ownerUuid;
                    var targetCharacter = obj.targetUuid;
                    var cardUuid = obj.card;
                    */
                    return false; // Game._playboardManager.CharacterTransferCard(sourceCharacter, targetCharacter, cardUuid, userid);
                },

                onCharacterJoinCharacter: function (userid, socket, data)
                {
                    var cardUuid = data.uuid;
                    var targetcharacter = data.targetcharacter;
                    var targetCompany = data.companyId;
                    var isFromHand = data.fromHand;

                    if (isFromHand)
                    {
                        if (Game._playboardManager.removeCardFromDeckOrCompany(userid, cardUuid))
                            Game.updateHandCounterOnlyPlayer(userid);
                    }

                    let sWho = Game.getCardCode(cardUuid, "Character") + " ";
                    let sHow = "";
                    if (!Game._playboardManager.JoinCharacter(cardUuid, targetcharacter, targetCompany, userid))
                        sHow = "cannot join under direct influence";
                    else
                    {
                        Game.removeEmptyCompanies();

                        let sChar = Game.getCharacterCode(targetcharacter, "a character");
                        sHow = "joined " + sChar + " under direct influence";
                    }

                    g_Chat.send(userid, sWho + sHow);
                },

                onCharacterJoinCompany: function (userid, socket, data)
                {
                    var _uuid = data.uuid;
                    var _source = data.source;
                    var _companyId = data.companyId;

                    if (_uuid === "" || _source === "" || _companyId === "")
                        return;

                    if (!Game._playboardManager.JoinCompany(_uuid, _source, _companyId, userid))
                    {
                        console.log("Character " + _uuid + " cannot join the company " + _companyId);
                        return;
                    }

                    if (_source === "hand")
                    {
                        Game.updateHandCounterOnlyPlayer(userid);
                        g_MeccgApi.publish("/game/remove-card-from-hand", userid, _uuid);
                    }

                    Game.removeEmptyCompanies();

                    {
                        let sWho = Game.getCardCode(_uuid, "Character") + " joined";
                        let sCompanyCharacter = Game.getFirstCompanyCharacterCode(_companyId, "");
                        if (sCompanyCharacter === "")
                            sWho += " a company";
                        else
                            sWho += " the company of " + sCompanyCharacter;

                        g_Chat.send(userid, sWho);
                    }
                }
            },

            company: {
                onGameCompanyCreate: function (userid, socket, data)
                {
                    var _uuid = data.uuid;
                    var _source = data.source;

                    if (_uuid === "" || _source === "")
                        return false;

                    var _id = Game._playboardManager.CreateNewCompany(_uuid, _source, userid);
                    if (_id === "")
                        return false;

                    if (_source === "hand")
                    {
                        Game.updateHandCounterOnlyPlayer(userid);
                        g_MeccgApi.publish("/game/remove-card-from-hand", userid, _uuid);
                    }

                    // draw the company
                    g_MeccgApi.publish("/game/player/draw/company", userid, Game._playboardManager.GetFullCompanyByCompanyId(_id));
                    Game.removeEmptyCompanies();

                    {
                        let sCode = Game.getCardCode(_uuid, "");
                        if (sCode !== "")
                            g_Chat.send(userid, sCode + " created a new company");
                        else
                            g_Chat.send(userid, "New company created");
                    }

                    return true;
                },

                onGameCompanyHighlight : function(userid, socket, jData)
                {
                    if (typeof jData.company === "undefined")
                        return;

                    let company = jData.company;
                    if (company !== "")
                    {
                        g_MeccgApi.publish("/game/company/highlight", userid, {company: company});

                        let sCompanyCharacter = Game.getFirstCompanyCharacterCode(company, "");
                        if (sCompanyCharacter !== "")
                            g_Chat.send(userid, "marks company of " + sCompanyCharacter);
                    }
                },

                onGameCompanyArrives: function (userid, socket, jData)
                {
                    if (typeof jData.company === "undefined")
                        return;

                    let company = jData.company;
                    if (company === "")
                        return;

                    Game._playboardManager.CompanyArrivedAtDestination(company);
                    g_MeccgApi.publish("/game/company/arrive", userid, {company: company});

                    let sCompanyCharacter = Game.getFirstCompanyCharacterCode(company, "");
                    if (sCompanyCharacter !== "")
                        g_Chat.send(userid, "The company of " + sCompanyCharacter + " arrives");
                    else
                        g_Chat.send(userid, "The company arrives");
                },

                onGameCompanyLocationSetLocation: function (userid, socket, obj)
                {
                    Game._playboardManager.SetCompanyStartSite(obj.companyUuid, obj.start, obj.regions, obj.destination);
                    let res = Game._playboardManager.GetCompanyAttachedLocationCards(obj.companyUuid);
                    let result = {
                        company: obj.companyUuid, 
                        start: res.current, 
                        regions: res.regions, 
                        target: res.target, 
                        revealed: false, 
                        attached: res.attached,
                        current_tapped : res.current_tapped,
                        target_tapped : res.target_tapped
                    };
                    
                    g_MeccgApi.publish("/game/player/draw/locations", userid, result);
                    g_Chat.send(userid, " organises locations.");
                },

                onGameCompanyLocationAttach: function (userid, socket, data)
                {
                    var _uuid = data.uuid;
                    const targetCompanyUuid = data.companyUuid;
                    const revealOnDrop = data.reveal;

                    var card = Game._playboardManager.PopCardFromHand(_uuid);
                    if (card === null)
                    {
                        g_Chat.send(userid, "Cannot add foreign card to location threats");
                        return;
                    }

                    if (!Game._playboardManager.AddHazardToCompanySite(_uuid, targetCompanyUuid))
                    {
                        g_Chat.send(userid, "cannot add hazard to company.");
                        return;
                    }

                    card.revealed = revealOnDrop;

                    g_MeccgApi.publish("/game/remove-card-from-hand", "", _uuid);
                    g_MeccgApi.publish("/game/add-onguard", userid, {
                        uuid: _uuid,
                        company: targetCompanyUuid,
                        code: card.code,
                        type: card.type,
                        state: card.state,
                        revealed: revealOnDrop,
                        owner: card.owner
                    });
                    
                    Game.updateHandCountersPlayer(userid);

                    if (revealOnDrop)
                        g_Chat.send(userid, " attached " + card.code + " to site/region");
                    else
                        g_Chat.send(userid, " played an on guard card");
                },

                onGameCompanyLocationReveal: function (userid, socket, data)
                {
                    Game._playboardManager.RevealCompanyDestinationSite(data.companyUuid);
                    g_MeccgApi.publish("/game/company/location/reveal", userid, {company: data.companyUuid});
                    g_Chat.send(userid, " revealed locations.");
                }

            },

            global: {
                restoreGame: function (userid, socket, data)
                {
                    /*
                     if (Game.restoreSavedGame(data))
                     g_MeccgApi.publish("/game/state/restored", userid, {});
                     else
                     {
                     g_Chat.send(userid, " could not restore the saved game.");
                     g_MeccgApi.publish("/game/score/final", "", Game.getFinalScore());
                     }
                     */
                },

                onDiscardOpenly : function(userid, socket, data)
                {
                    var card = Game._playboardManager.GetCardByUuid(data.uuid);
                    if (card !== null)
                    {
                        g_MeccgApi.publish("/game/discardopenly", userid, {
                            code: card.code,
                            owner : card.owner,
                            uuid : data.uuid
                        });
                    }
                },

                saveGame: function (userid, socket, data)
                {
                    let jGameData = Game.saveCurrentGame();
                    let sSalt = createUuid();
                    let sHash = createHashFromData(jGameData, sSalt);
                    
                    const saved = {
                        data : jGameData,
                        salt: sSalt,
                        hash : sHash
                    };
                    
                    g_MeccgApi.publish("/game/state/save/receive", userid, saved);
                },
                
                saveGameCurrent : function (userid, socket, data)
                {
                    let jGameData = Game.saveCurrentGame();
                    let sSalt = createUuid();
                    let sHash = createHashFromData(jGameData, sSalt);
                    
                    const saved = {
                        data : jGameData,
                        salt: sSalt,
                        hash : sHash
                    };
                    
                    g_MeccgApi.publish("/game/state/save/current", userid, saved);
                },
                
                rollDices: function (userid, socket, obj)
                {
                    const n1 = g_MeccgApi.getRandomDiceRoll();
                    const n2 = g_MeccgApi.getRandomDiceRoll();
                    const nRes = n1 + n2;

                    g_MeccgApi.publish("/game/roll-dices", userid, {first: n1, second: n2, total: nRes, user: userid });
                    g_Chat.send(userid, " rolls " + nRes + " (" + n1 + ", " + n2 + ")");
                },

                phase: function (userid, socket, sPhase) // todo
                {
                    switch (sPhase)
                    {
                        case "organisation":
                        case "movement":
                        case "site":
                        case "eot":
                            break;

                        default:
                            return;
                    }

                    let nCurrentTurn = Game.getCurrentTurn();
                    let nNewTurn = nCurrentTurn;

                    if (sPhase === "site")
                    {
                        var list = Game._playboardManager.GetCompanyIds(userid);
                        for (var i = 0; i < list.length; i++)
                            Game._playboardManager.CompanyArrivedAtDestination(list[i]);
                    } 
                    else if (sPhase === "eot")
                    {
                        Game.nextPlayersTurn();
                        sPhase = "organisation";
                        nNewTurn = Game.getCurrentTurn();

                        g_Chat.send(userid, " ends turn. Active player is " + Game.players.getCurrentPlayerName());
                        Game.inits.sendCurrentHandSize();
                    }

                    if (sPhase === "organisation")
                    {
                        var list = Game._playboardManager.GetCompanyIds(userid);
                        for (var i = 0; i < list.length; i++)
                            Game._playboardManager.ReadyCompanyCards(list[i]);

                        g_MeccgApi.publish("/game/player/set-current", Game.players.getCurrent(), {name: Game.players.getCurrent(), displayname: Game.players.getCurrentPlayerName()});
                    }

                    Game.setPhase(sPhase);
                    Game.inits.sendCurrentPhase();

                    if (nNewTurn - nCurrentTurn !== 0)
                        g_Chat.send(Game.players.getCurrent(), " Starting their turn " + nNewTurn);

                    g_Chat.send(Game.players.getCurrent(), " is now in " + sPhase + " phase");
                },

                onGameAddCardsToGame: function (userid, socket, data)
                {
                    let count = Game.addCardsToGameDuringGame(userid, data.cards);
                    if (count < 1)
                    {
                        g_Chat.send(userid, "could not add new cards to sideboard");
                        return;
                    }

                    if (count === 1)
                        g_Chat.send(userid, "just added 1 card to their sideboard");
                    else
                        g_Chat.send(userid, "just added " + count + " cards to their sideboard");

                    Game.updateHandCountersPlayer(userid);

                }
            },

            view: {
                
                _getList : function(userid, obj)
                {
                    var list = [];
                    if (obj === "sideboard")
                        list = Game._playboardManager.GetCardsInSideboard(userid);
                    else if (obj === "discardpile" || obj === "discard")
                        list = Game._playboardManager.GetCardsInDiscardpile(userid);
                    else if (obj === "playdeck")
                        list = Game._playboardManager.GetCardsInPlaydeck(userid);
                    else if (obj === "victory")
                        list = Game._playboardManager.GetCardsInVictory(userid);
                    else if (obj === "hand")
                        list = Game._playboardManager.GetCardsInHand(userid);
                    else
                        console.log("unknown target " + obj);
                    
                    return list;
                },

                reveal: function (userid, socket, obj)
                {
                    g_MeccgApi.publish("/game/view-cards/reveal/list", userid, {type: obj, list: Game.callbacks.view._getList(userid, obj) });
                    g_Chat.send(userid, " offers to show cards in " + obj);
                },

                list: function (userid, socket, obj)
                {
                    var list = Game.callbacks.view._getList(userid, obj);

                    g_MeccgApi.publish("/game/view-cards/list", userid, {type: obj, list: list});
                    g_Chat.send(userid, " views cards in " + obj);
                },

                closeList : function (userid, socket, obj)
                {
                    if (typeof obj.offered === "undefined")
                        return;

                    if (!obj.offered)
                    {
                        g_Chat.send(userid, " closes card offering");
                        g_MeccgApi.publish("/game/view-cards/list/close", userid, { });
                    }
                    else
                        g_Chat.send(userid, " closes card offer");
                },

                shuffle: function (userid, socket, obj)
                {
                    if (obj.target === "playdeck")
                    {
                        Game._playboardManager.ShufflePlaydeck(userid);
                        g_Chat.send(userid, " shuffles playdeck");
                    }
                    else if (obj.target === "discardpile")
                    {
                        Game._playboardManager.ShuffleDiscardpile(userid);
                        g_Chat.send(userid, " shuffles discardpile");
                    }
                },
                
                offerReveal : function (userid, socket, obj)
                {
                    let sUuid = obj.uuid;
                    if (sUuid !== "")
                    {
                        g_Chat.send(userid, " shows a card");
                        g_MeccgApi.publish("/game/view-cards/reveal/reveal", userid, {uuid: sUuid});
                    }
                },
                
                offerRemove : function (userid, socket, obj)
                {
                    let sUuid = obj.uuid;
                    if (sUuid !== "")
                        g_MeccgApi.publish("/game/view-cards/reveal/remove", userid, {uuid: sUuid});
                }
            }
        },

        init: function (_playboardManager)
        {
            this._playboardManager = _playboardManager;

            g_MeccgApi.addListener("/game/card/state/set", Game.callbacks.card.onGameCardStateSet); //xxx
            g_MeccgApi.addListener("/game/card/state/glow", Game.callbacks.card.onGameStateGlow);
            g_MeccgApi.addListener("/game/card/state/reveal", Game.callbacks.card.onGameCardStateReveal);
            g_MeccgApi.addListener("/game/card/draw", Game.callbacks.card.onCardDraw);
            g_MeccgApi.addListener("/game/card/draw/single", Game.callbacks.card.onCardDrawSingle);
            g_MeccgApi.addListener("/game/card/get-top-card-from-hand", Game.callbacks.card.onGetTopCardFromHand); /* Get top X cards from your hand */
            g_MeccgApi.addListener("/game/card/store", Game.callbacks.card.onCardStore);
            g_MeccgApi.addListener("/game/card/move", Game.callbacks.card.onCardMove);
            g_MeccgApi.addListener("/game/card/discard", Game.callbacks.card.onCardDiscard);

            g_MeccgApi.addListener("/game/stagingarea/add/card", Game.callbacks.onStagingAreaAddCard);

            g_MeccgApi.addListener("/game/state/restore", Game.callbacks.global.restoreGame);
            g_MeccgApi.addListener("/game/state/save/request", Game.callbacks.global.saveGame);
            g_MeccgApi.addListener("/game/state/save/current", Game.callbacks.global.saveGameCurrent);
            g_MeccgApi.addListener("/game/roll-dices", Game.callbacks.global.rollDices);
            g_MeccgApi.addListener("/game/phase/set", Game.callbacks.global.phase); /* Set the current phase of the game turn */
            g_MeccgApi.addListener("/game/add-cards-to-game", Game.callbacks.global.onGameAddCardsToGame); /* add a list of cards to the sideboard */
            
            g_MeccgApi.addListener("/game/view-cards/reveal-pile", Game.callbacks.view.reveal);
            g_MeccgApi.addListener("/game/view-cards/list", Game.callbacks.view.list);
            g_MeccgApi.addListener("/game/view-cards/list/close", Game.callbacks.view.closeList);
            g_MeccgApi.addListener("/game/view-cards/shuffle", Game.callbacks.view.shuffle);
            g_MeccgApi.addListener("/game/view-cards/offer-reveal", Game.callbacks.view.offerReveal);
            g_MeccgApi.addListener("/game/view-cards/offer-remove", Game.callbacks.view.offerRemove);
            

            g_MeccgApi.addListener("/game/company/create", Game.callbacks.company.onGameCompanyCreate);
            g_MeccgApi.addListener("/game/company/arrive", Game.callbacks.company.onGameCompanyArrives);
            g_MeccgApi.addListener("/game/company/highlight", Game.callbacks.company.onGameCompanyHighlight);
            g_MeccgApi.addListener("/game/company/location/set-location", Game.callbacks.company.onGameCompanyLocationSetLocation);
            g_MeccgApi.addListener("/game/company/location/reveal", Game.callbacks.company.onGameCompanyLocationReveal);
            g_MeccgApi.addListener("/game/company/location/attach", Game.callbacks.company.onGameCompanyLocationAttach);

            g_MeccgApi.addListener("/game/score/show", Game.callbacks.score.show);
            g_MeccgApi.addListener("/game/score/update", Game.callbacks.score.update);
            g_MeccgApi.addListener("/game/score/add", Game.callbacks.score.add);

            g_MeccgApi.addListener("/game/draw/company", Game.callbacks.draw.onGameDrawCompany); /* draw a single company by its id */
            g_MeccgApi.addListener("/game/draw/companies", Game.callbacks.draw.onGameDrawCompanies);

            g_MeccgApi.addListener("/game/character/host-card", Game.callbacks.character.onCharacterHostCard);
            g_MeccgApi.addListener("/game/character/receive-card", Game.callbacks.character.onCharacterReceiveCard);
            g_MeccgApi.addListener("/game/character/join/character", Game.callbacks.character.onCharacterJoinCharacter);
            g_MeccgApi.addListener("/game/character/join/company", Game.callbacks.character.onCharacterJoinCompany);

            g_MeccgApi.addListener("/game/discardopenly", Game.callbacks.global.onDiscardOpenly);
            
        },

        getCardCode: function (uuid, sDefault)
        {
            var card = Game._playboardManager.GetCardByUuid(uuid);
            return card !== null ? card.code : sDefault;
        },

        getCharacterCode: function (uuid, sDefault)
        {
            var card = Game._playboardManager.GetCharacterCardByUuid(uuid);
            return card !== null ? card.code : sDefault;
        },

        getFirstCompanyCharacterCode: function (uuid, sDefault)
        {
            var card = Game._playboardManager.GetFirstCompanyCharacterCardByCompanyId(uuid);
            return card !== null ? card.code : sDefault;
        }

    };

    return Game;
}

