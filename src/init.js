import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import monero_utils_promise from "./myswap-core-js/monero_utils/MyMoneroCoreBridge.js";
import monero_amount_format_utils from "./myswap-core-js/monero_utils/monero_amount_format_utils.js"
import fetch from "node-fetch";

const monero_utils = await monero_utils_promise();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.disable('x-powered-by');
app.disable('etag');

app.get('/', (req, res) => {
  res.send('This API doesn\'t have a frontend, but at least you\'re here 😄');
});

app.get('/create_wallet', (req, res) => {
  monero_utils_promise.then(monero_utils => {
    const new_wallet = monero_utils.newly_created_wallet("en", req.query.nettype ? req.query.nettype : 0);
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
  function getUnspentOutputs(parameters, fn) {
    const data = '{"address": "' + parameters.address + '", "view_key": "' + parameters.view_key + '","amount":"' + parameters.amount + '","mixin":10,"use_dust":' + parameters.use_dust + ',"dust_threshold":"' + parameters.dust_threshold + '"}';
    fetch("https://wallet.getswap.eu/api/get_unspent_outs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: data
      }
    ).then(response => response.json().then((jsonResponse) => {
      fn(null, { outputs: jsonResponse.outputs, per_byte_fee: jsonResponse.per_byte_fee });
    }).catch(err => fn(err && err.Error ? err.Error : "" + err)));
    return {
      abort: function () {
        console.warn("TODO: abort!")
      }
    }
  }

  function getRandomOutputs(parameters, fn) {
    const body = '{"amounts": ["0"],"count": 11}';
    fetch('https://wallet.getswap.eu/api/get_random_outs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: body
    }).then(response => response.json().then(jsonResponse => {
      fn(null, { amount_outs: jsonResponse.amount_outs })
    })).catch(err => fn(err && err.Error ? err.Error : "" + err));
    return {
      abort: function () {
        console.warn("TODO: abort!")
      }
    }
  }

  function submitRawTransaction(parameters, fn) {
    fetch('https://wallet.getswap.eu/api/submit_raw_tx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tx: parameters.tx })
    }).then(response => response.json().then(jsonResponse => {
      switch (jsonResponse) {
        case null:
          fn(null, {});
          break;
        default:
          fn(jsonResponse);
          break;
      }
    })).catch(err => fn(err && err.Error ? err.Error : "" + err));
    return {
      abort: function () {
        console.warn("TODO: abort!")
      }
    }
  }

  let sending_amount;
  try {
    sending_amount = (monero_amount_format_utils.parseMoney(req.body.sending_amount)).toString();
  } catch (e) {
    throw new Error(`Couldn't parse amount ${req.body.sending_amount}: ${e}`)
  }
  let coreBridge_instance;
  try {
    coreBridge_instance = require('./myswap-core-js/monero_utils/MyMoneroCoreBridge')({ asmjs: undefined });
  } catch (e) {
    console.error(e);
    return;
  }
  coreBridge_instance.then(coreBridge => {
    coreBridge.async__send_funds({
      is_sweeping: req.body.is_sweeping,
      payment_id_string: req.body.payment_id_string,
      sending_amount: req.body.is_sweeping ? 0 : sending_amount,
      from_address_string: req.body.from_address_string,
      sec_viewKey_string: req.body.view_key,
      sec_spendKey_string: req.body.spendKey_sec,
      pub_spendKey_string: req.body.spendKey_pub,
      to_address_string: req.body.to_address_string,
      priority: req.body.priority,
      unlock_time: 0,
      nettype: req.body.nettype,
      get_unspent_outs_fn: function (req_params, cb) {
        getUnspentOutputs(req_params, function (err_msg, res) {
          cb(err_msg, res);
        });
      },
      get_random_outs_fn: function (req_params, cb) {
        getRandomOutputs(req_params, function (err_msg, res) {
          cb(err_msg, res);
        });
      },
      submit_raw_tx_fn: function (req_params, cb) {
        submitRawTransaction(req_params, function (err_msg, res) {
          cb(err_msg, res);
        });
      },
      status_update_fn: function (params) {
        //twirling our fingers
      },
      error_fn: function (params) {
        res.status(500).json({
          success: false,
          reason: "An unkown error occured while sending XWP",
          err_msg: params.err_msg
        });
      },
      success_fn: function (params) {
        const formattedFee = (monero_amount_format_utils.parseMoney(params.used_fee)).toString();
        res.json({
          success: true,
          used_fee: formattedFee,
          tx_hash: params.tx_hash,
        });
      }
    });
  });

});

app.post('/login_with_mnemonic', (req, res) => {
  monero_utils_promise.then(monero_utils => {
    try {
      const walletData = monero_utils.seed_and_keys_from_mnemonic(req.body.mnemonic, req.body.nettype);
      res.json({
        success: true,
        wallet: walletData,
      })
    } catch (e) {
      res.status(400).json({
        success: false,
        err_msg: e
      });
    }
  });
});

app.get('/get_recent_transactions', (req, res) => {
  res.send('you choose to get recent transactions. Good choice 👍');
});

app.listen(process.env.PORT, () =>
  console.log(`Mobile Wallet API listening on port ${process.env.PORT}!`),
);
