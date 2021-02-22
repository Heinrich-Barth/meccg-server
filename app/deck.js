
module.exports = 
{
    create : function(playerId, jsonDeck, listAgents, type, _cardMap)
    {
        return _create(playerId, jsonDeck, listAgents, type, _cardMap);
    }
};


let g_deck_uuid_count = 0;

function createCardEntry(card, playerId, isAgent)
{
    if (typeof card.code === "undefined")
    {
        console.log("Invalid code");
        return null;
    }
    else if (typeof card.type === "undefined")
    {
        console.log("Invalid card type");
        return null;
    }
    
    return {
        code : card.code,
        type : card.type.toLowerCase(),
        uuid : playerId + "_" + (++g_deck_uuid_count),
        state : 0,
        owner : playerId,
        revealed: !isAgent,
        agent : isAgent
    };
}

function randomNumber(max)
{
    if (max <= 1)
        return 0;
    else
        return Math.floor((Math.random() * max));
}

function isAgent(code, listAgents)
{
    const nSize = code === "" ? -1 : listAgents.length;
    for(var i = 0; i < nSize; i++)
    {
        if (listAgents[i] === code)
            return true;
    }
    
    return false;
}

function removeQuotes(sCode)
{
    if (sCode.indexOf('"') === -1)
        return sCode;
    else
        return sCode.replace(/"/g, "");
}

function add(cards, _targetList, playerId, _cardMap, listAgents)
{
    var card, _entry;
    for (var key in cards)
    {
        card = cards[key];

        card.code = removeQuotes(card.code);
        count = card.count;
        
        for (var i = 0; i < count; i++)
        {
            _entry = createCardEntry(card, playerId, isAgent(card.code, listAgents));
            if (_entry === null)
            {
                console.log("Cannot add card " + key + " to deck.");
                break;
            }
            
            _targetList.push(_entry.uuid);
            _cardMap[_entry.uuid] = _entry;
        }
    }
}


function _create(playerId, jsonDeck, listAgents, type, _cardMap)
{
    let deck = {

        id : playerId,
        handCards : [],
        discardPile : [],
        sideboard : [],
        victory : [],
        playdeck : [],

        saveState : function()
        {
            return {
                handCards : [],
                discardPile : [],
                sideboard : [],
                victory : [],
                playdeck : []
            };
        },

        shuffle : function()
        {
            var _newList = [ ];
            var _index;

            while (this.playdeck.length > 0)
            {
                _index = randomNumber(this.playdeck.length);
                _newList.push(this.playdeck[_index]);
                this.playdeck.splice(_index, 1);
            }

            this.playdeck = _newList;
        },

        shuffleDiscardpile : function()
        {
            var _newList = [ ];
            var _index;

            while (this.discardPile.length > 0)
            {
                _index = randomNumber(this.discardPile.length);
                _newList.push(this.discardPile[_index]);
                this.discardPile.splice(_index, 1);
            }

            this.discardPile = _newList;
        },

        draw : function()
        {
            // move discardpile into playdeck and reshuffle
            if (this.playdeck.length === 0)
            {
                for (var i = 0; i < this.discardPile.length; i++)
                    this.playdeck.push(this.discardPile[i]);
                                        
                DECKS.clearPlayerSites(deck.id);

                this.discardPile = [];
                this.shuffle();
            }

            var _id = "";
            if (this.playdeck.length > 0)
            {
                _id = this.playdeck[0];
                this.handCards.push(_id);
                this.playdeck.splice(0,1);
            }

            return _id;
        },

        listContains : function(uuid, list)
        {
            for(var i = 0; i < list.length; i++)
            {
                if (list[i].uuid === uuid)
                    return true;
            } 
        },

        push : {

            /**
             * Add a card to a list
             * @param {type} uuid
             * @param {type} list
             * @returns {Boolean} success
             */
            to : function(uuid, list)
            {
                if (deck.listContains(uuid, list))
                    return false;

                list.unshift(uuid); // put to start of array so it will be drawn next
                return true;
            },

            /**
             * Add a card to victory
             * @param {type} uuid
             * @returns {Boolean} success
             */
            toVictory : function(uuid)
            {
                return this.to(uuid, deck.victory);
            },

            /**
             * Add a card to sideboard
             * @param {type} uuid
             * @returns {Boolean} success
             */
            toSideboard : function(uuid)
            {
                return this.to(uuid, deck.sideboard);
            },

            /**
             * Add a card to the playdeck
             * @param {type} uuid
             * @returns {Boolean} success
             */
            toPlaydeck : function(uuid)
            {
                return this.to(uuid, deck.playdeck);
            },

            /**
             * Add a card to the discard pile
             * @param {type} uuid
             * @returns {Boolean} success
             */
            toDiscardpile : function(uuid)
            {
                return this.to(uuid, deck.discardPile);
            },

            /**
             * Add a card to the hand cards
             * 
             * @param {type} uuid
             * @returns {Boolean} success
             */
            toHand : function(uuid)
            {
                return this.to(uuid, deck.handCards);
            }
        },

        pop : {

            /**
             * Remove a card from a list
             * @param {type} uuid
             * @param {type} list
             * @returns {boolean} 
             */
            from : function(uuid, list)
            {
                for(var i = 0; i < list.length; i++)
                {
                    if (list[i] === uuid)
                    {
                        list.splice(i, 1);
                        return true;
                    }
                }

                return false;
            },

            /**
             * Pops a card from the sideboard
             * @param {type} uuid
             * @returns {boolean} 
             */
            fromSideboard : function(uuid)
            {
                return this.from(uuid, deck.sideboard);
            },

            /**
             * Pops a card from the playdeck
             * @param {type} uuid
             * @returns {boolean} 
             */
            fromPlaydeck : function(uuid)
            {
                return this.from(uuid, deck.playdeck);
            },

            /**
             * Pops a card from the playdeck
             * @param {type} uuid
             * @returns {boolean} 
             */
            fromHand : function(uuid)
            {
                return this.from(uuid, deck.handCards);
            },

            /**
             * Pops a card from the discard pile
             * @param {type} uuid
             * @returns {boolean} 
             */
            fromDiscardpile : function(uuid)
            {
                return this.from(uuid, deck.discardPile);
            },

            /**
             * Pops a card from the fromVictory pile
             * @param {type} uuid
             * @returns {boolean} 
             */
            fromVictory : function(uuid)
            {
                return this.from(uuid, deck.victory);
            }
        },

        /**
         * Get card in hand
         * @returns {Array|deck.handCards}
         */
        getCardsInHand : function()
        {
            return deck.handCards;
        },

        get : {
            hand : function()
            {
                return deck.handCards;
            },
            discardpile : function()
            {
                return deck.discardPile;
            },
            playdeck : function()
            {
                return deck.playdeck;
            },
            victory : function()
            {
                return deck.victory;
            },
            sideboard : function()
            {
                return deck.sideboard;
            }
        },
                
        /**
         * Add cards to the game AFTER all decks have been registered already,
         * so they will be added to the SIDEBOARD 
         * 
         * @param {String} playerId 
         * @param {list} cards 
         * @param {list} listAgents 
         */
        registerCards : function(playerId, cards, listAgents, _cardMap)
        {
            var nAdded = 0;
            var card,  _entry;

            const nSize = cards.length;
            for (var c = 0; c < nSize; c++)
            {
                card = cards[c];
                count = card.count;

                for (var i = 0; i < count; i++)
                {
                    card.code = removeQuotes(card.code);

                    _entry = createCardEntry(card, playerId, isAgent(card.code, listAgents));
                    if (_entry === null)
                    {
                        console.log("Cannot add card " + card.code + " to deck.");
                        break;
                    }
                    
                    nAdded++;
                    deck.sideboard.push(_entry.uuid);
                    _cardMap[_entry.uuid] = _entry;
                }
            }
            
            return nAdded;
        }
    };
    
    add(jsonDeck["pool"], deck.handCards, playerId, _cardMap, listAgents);
    add(jsonDeck["resources"], deck.playdeck, playerId, _cardMap, listAgents);
    add(jsonDeck["hazards"], deck.playdeck, playerId, _cardMap, listAgents);
    add(jsonDeck["chars"], deck.playdeck, playerId, _cardMap, listAgents);
    add(jsonDeck["avatar"], deck.playdeck, playerId, _cardMap, listAgents);
    add(jsonDeck["sideboard"], deck.sideboard, playerId, _cardMap, listAgents);

    deck.shuffle();
    return deck;
}