import 'dotenv/config';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const mymonero = require("./myswap-core-js-2.0.0/index");

app.get('/', (req, res) => {
  res.send('This API doesn\'t have a frontend, but at least you\'re here 😄');
});

app.get('/create_wallet', (req, res) => {
    const walletUtils = require('./myswap-core-js-1.0.0/monero_utils/monero_wallet_utils');
    const new_wallet = walletUtils.NewlyCreatedWallet('english', 0);
    const wallet = {
      mnemonic: new_wallet.mnemonicString,
      wallet_address: new_wallet.keys.public_addr,
      spendKey: new_wallet.keys.spend.sec,
      viewKey: new_wallet.keys.view.sec,
    };
    res.send(JSON.stringify(wallet));
});

app.post('/send_funds', (req, res) => {
  res.send("you choose to send funds. Good choice 👍");
});

app.get('/get_recent_transactions', (req, res) => {
  res.send('you choose to get recent transactions. Good choice 👍');
});

app.listen(process.env.PORT, () =>
  console.log(`Mobile Wallet API listening on port ${process.env.PORT}!`),
);
