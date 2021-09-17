import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { nettype_utils, monero_utils_promise, monero_sendingFunds_utils } from "./myswap-core-js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('This API doesn\'t have a frontend, but at least you\'re here 😄');
});

app.get('/create_wallet', (req, res) => {
    monero_utils_promise.then(monero_utils => {
      const new_wallet =  monero_utils.newly_created_wallet( "en", nettype_utils.network_type.MAINNET);
      res.json({
        mnemonic: new_wallet.mnemonic_string,
        wallet_address: new_wallet.address_string,
        spendKey_pub: new_wallet.pub_spendKey_string,
        viewKey_pub: new_wallet.pub_viewKey_string,
        spendKey_sec: new_wallet.sec_spendKey_string,
        viewKey_sec: new_wallet.sec_viewKey_string,
      });
    })
});

app.post('/send_funds', (req, res) => {
  //used for sending a response back
  let response = {
    status: "unfinished",
    reason: null,
    tx: null,
  };
  async function getUnspentOutputs(params, cb) {
    console.log(params);
    return new Promise((resolve, reject) => {
      var data = '{"address": "' + params.address + '", "view_key": "' + params.view_key + '","amount":"' + params.amount + '","mixin":10,"use_dust":' + params.use_dust + ',"dust_threshold":"' + params.dust_threshold + '"}';
      var outputs;
      var per_byte_fee;
      fetch(
        "https://wallet.getswap.eu/api/get_unspent_outs",
        {
          method: "POST",
          headers: {
          "Content-Type": "application/json"
          },
          body: data
        }
        ).then(response => response.json())
        .then((jsonResponse) => {
          console.log("API call finished");
          outputs = jsonResponse.outputs;
          per_byte_fee = jsonResponse.per_byte_fee;
          resolve({
          outputs: outputs,
          per_byte_fee: per_byte_fee
        });
        }).catch(err => reject(`Error: ${err}`));
    });
  }
  async function getRandomOutputs(params, cb) {
    console.log(params);
  }
  async function submitRawTx(params, cb) {
    console.log(params);
  }

  async function sendFunds() {
    monero_utils_promise.async__send_funds({
      is_sweeping: req.body.is_sweeping,
      payment_id_string: req.body.payment_id, // may be nil or undefined
      sending_amount: req.body.is_sweeping ? 0 : req.body.sending_amount, // sending amount
      from_address_string: req.body.from_address,
      sec_viewKey_string: req.body.viewKey,
      sec_spendKey_string: req.body.spendKey_sec,
      pub_spendKey_string: req.body.spendKey_pub,
      to_address_string: req.body.to_address,
      priority: req.body.priority,
      unlock_time: 0, // unlock_time
      nettype: req.body.nettype,
      get_unspent_outs_fn: function(req_params, cb)
      {
        getUnspentOutputs(req_params, function(err_msg, res)
        {
          cb(err_msg, res);
        });
      },
      get_random_outs_fn: function(req_params, cb)
      {
        getRandomOutputs(req_params, function(err_msg, res)
        {
          cb(err_msg, res);
        });
      },
      submit_raw_tx_fn: function(req_params, cb)
      {
        submitRawTx(req_params, function(err_msg, res)
        {
          cb(err_msg, res);
        });
      },
      //
      status_update_fn: function(params)
      {
        console.log("> Send funds step " + params.code + ": " + monero_sendingFunds_utils.SendFunds_ProcessStep_MessageSuffix[params.code])
      },
      error_fn: function(params)
      {
        response = {
          status: "error",
          reason: params.err_msg,
          tx: null,
        };
        res.json(response);
      },
      success_fn: function(params)
      {
        console.log("sentAmount ", params.total_sent)
        console.log("final__payment_id ", params.final_payment_id)
        console.log("tx_hash ", params.tx_hash)
        console.log("tx_fee ", params.used_fee)
        console.log("tx_key ", params.tx_key)
        console.log("tx_pub_key ", params.tx_pub_key)
        response = {
          status: "success",
          reason: null,
          tx: params.tx_hash,
        };
        res.json(response);
      }
    });
  }
  sendFunds();
});

app.get('/get_recent_transactions', (req, res) => {
  res.send('you choose to get recent transactions. Good choice 👍');
});

app.listen(process.env.PORT, () =>
  console.log(`Mobile Wallet API listening on port ${process.env.PORT}!`),
);
