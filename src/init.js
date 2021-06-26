import 'dotenv/config';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('This API doesn\'t have a frontend, but at least you\'re here 😄');
});

app.get('/create_wallet', (req, res) => {

  const mymonero = require("./myswap-core-js-2.0.0/index");
  async function foo()
  {
    const monero_utils = await mymonero.monero_utils_promise;
    const nettype = mymonero.nettype_utils.network_type.MAINNET; // only use mainnet for now
    const new_wallet = monero_utils.newly_created_wallet("english", nettype);
    const mnemonic = new_wallet.mnemonic_string;
    const pub_spendKey = new_wallet.pub_spendKey_string;
    const pub_viewKey = new_wallet.pub_viewKey_string;
    const priv_spendKey = new_wallet.sec_spendKey_string;
    const priv_viewKey = new_wallet.sec_viewKey_string;
    const walletAddress = new_wallet.address_string;
    return `Mnemonic: ${mnemonic}<br>Public Spend Key: ${pub_spendKey}<br>Public View Key: ${pub_viewKey}<br>Private Spend Key: ${priv_spendKey}<br>Private View Key: ${priv_viewKey}<br>Wallet Address: ${walletAddress}`;
  }
  foo().then((response) => {
    res.send('You choose to create a wallet. Good choice 👍<br><br>' + response);
  }).catch((error) => {
    res.send(`An unknown error occured :(:\n\n${error}`)
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
