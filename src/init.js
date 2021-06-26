import 'dotenv/config';
import cors from 'cors';
import express, { response } from 'express';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const mymonero = require("./myswap-core-js-2.0.0/index");

app.get('/', (req, res) => {
  res.send('This API doesn\'t have a frontend, but at least you\'re here 😄');
});

app.get('/create_wallet', (req, res) => {

  async function create_wallet()
  {
    const monero_utils = await mymonero.monero_utils_promise;

    const nettype = mymonero.nettype_utils.network_type.MAINNET; // only use mainnet for now
    const new_wallet = monero_utils.newly_created_wallet("english", nettype);

    const wallet = {
      mnemonic: new_wallet.mnemonic_string,
      wallet_address: new_wallet.address_string,
      public_spendKey: new_wallet.pub_spendKey_string,
      public_viewKey: new_wallet.pub_viewKey_string,
      private_spendKey: new_wallet.sec_spendKey_string,
      private_viewKey: new_wallet.sec_viewKey_string,
    };

    return JSON.stringify(wallet);
  }
  create_wallet().then((wallet) => {
    res.send(wallet);
  }).catch((error) => {
    res_send = {
      status: "error",
      error: error,
    }
    res.send(JSON.stringify(res_send));
  });

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
