// Building an HTTP Server with Express
const express = require('express')
const app = express()
const http = require('http')
const crypto = http.createServer(app)

// We are using Coinbase node module for subscribing and receiving realtime updates
const {CoinbasePro} = require('coinbase-pro-node')
const {WebSocketChannelName, WebSocketEvent} = require('coinbase-pro-node')

require('dotenv').config()  // environmental variables

const port = process.env.PORT
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))

// Setting up own WebSocket channel for real-time updates
const WebSocket = require('ws')
const wss = new WebSocket.Server({ server: crypto })

wss.on('connection', ws => {
    console.info('Total connected user(s):', wss.clients.size)
})

app.use('/', express.static('public'))

/*
    We want to send available currency pairs data to the client side.
    And for that we are using "Server Push" architecture where crypto instantly pushes data as soon as it receives it.
    It is a kind of half-duplex or unidirectional communication.
    But after handshaking, only crypto is allowed to send data.
    It provides low latency transmission.
 */
app.get('/server-sent-events', function(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'close'
    })

    // List of available currency pairs such as 'DOGE-USD', 'BTC-USD', 'ETH-USD' and etc.
    const url = 'https://api.exchange.coinbase.com/products'
    const options = {method: 'GET', headers: {accept: 'application/json'}}

    fetch(url, options)
        .then(res => res.json())
        .then(json => {
            res.write("data: " + JSON.stringify(json) + "\n\n")
            console.info('The list of available currency pairs:', json.length)
        })
        .catch(err => console.error('error:' + err))

    res.on('close', () => { res.end() })    // close
})


// Credentials
const auth = {
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
    passphrase: process.env.PASSPHRASE,
    useSandbox: false,
    strictSSL: true
}

const client = new CoinbasePro(auth)   // Initialize coinbase client

/*
    A list of trading accounts from the profile of the API key.
    Url: https://api.exchange.coinbase.com/accounts
*/
client.rest.account.listAccounts().then(accounts => {
    const message = `You can trade "${accounts.length}" different pairs.`
    console.log(message)
})

// Setting up a web socket channel for real-time cryptocurrency prices
const channel = {
    /*
        TICKER_1000 is a special version of the ticker channel that only provides a ticker update about every 5 seconds.
        documentation: https://docs.cloud.coinbase.com/exchange/docs/websocket-channels
    */
    name: WebSocketChannelName.TICKER_1000,
    product_ids: ['DOGE-USD', 'BTC-USD', 'ETH-USD']
}

// Wait for open WebSocket to subscribe
client.ws.on(WebSocketEvent.ON_OPEN, async () => {
    // Subscribe to WebSocket channel
    await client.ws.subscribe([channel]);
})

// Listen to WebSocket subscription updates
client.ws.on(WebSocketEvent.ON_SUBSCRIPTION_UPDATE, subscriptions => {
    if (subscriptions.channels.length === 0) {  // When there are no more subscriptions...
        client.ws.disconnect()
    }
})

// Listen to WebSocket channel updates
client.ws.on(WebSocketEvent.ON_MESSAGE_TICKER, async tickerMessage => {
    /*
        Since we are constantly sending cryptocurrency updates to clients in real time,
        we will send updates via WebSocket for low latency transmission.
    */
    wss.clients.forEach(function each(client) {
        client.send(JSON.stringify(tickerMessage))
    })

    /*await client.ws.unsubscribe([
        {
            name: WebSocketChannelName.TICKER_1000,
            product_ids: [tickerMessage.product_id],
        },
    ])*/
})

// Connect to Coinbase WebSocket
client.ws.connect({debug: false});

// Launch server
crypto.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`)
})
