import { } from 'dotenv/config';
import cors from 'cors';
import express from 'express';

import monero_utils_promise from "./myswap-core-js/monero_utils/MyMoneroCoreBridge.js";
import monero_amount_format_utils from "./myswap-core-js/monero_utils/monero_amount_format_utils.js";
import coreBridge_instance from './myswap-core-js/monero_utils/MyMoneroCoreBridge.js';

import fetch from "node-fetch";

const monero_utils = await monero_utils_promise();
const core_bridge = await coreBridge_instance();

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
  const new_wallet = monero_utils.newly_created_wallet("en", 0);
  res.json({
    mnemonic: new_wallet.mnemonic_string,
    wallet_address: new_wallet.address_string,
    public_spend_key: new_wallet.pub_spendKey_string,
    public_view_key: new_wallet.pub_viewKey_string,
    private_spend_key: new_wallet.sec_spendKey_string,
    private_view_key: new_wallet.sec_viewKey_string,
  });
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
    fetch('http://autonode.getswap.eu:19952/submit_raw_transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tx_as_hex: parameters.tx })
    }).then(response => response.json().then(jsonResponse => {
      // TODO: make this work for the Swap JSON-RPC
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
    sending_amount = monero_amount_format_utils.parseMoney(req.body.amount).toString();
  } catch (e) {
    res.status(400).json({
      error: `Couldn't parse amount ${req.body.amount}: ${e}`,
      success: false
    });
    return;
  }

  core_bridge.async__send_funds({
    is_sweeping: req.body.is_sweeping,
    payment_id_string: "", // NOTE: payment IDs are deprecated
    sending_amount: req.body.is_sweeping ? 0 : sending_amount, // weird, but that's how monero apps do it
    from_address_string: req.body.from_address,
    sec_viewKey_string: req.body.private_view_key,
    sec_spendKey_string: req.body.private_spend_key,
    pub_spendKey_string: req.body.public_spend_key,
    to_address_string: req.body.to_address,
    priority: 1,
    unlock_time: 0,
    nettype: 0,
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
        error: `An unkown error occured while sending XWP: ${params.err_msg}`,
      });
    },
    success_fn: function (params) {
      const formattedFee = monero_amount_format_utils.parseMoney(params.used_fee).toString();
      res.json({
        success: true,
        used_fee: formattedFee,
        tx_hash: params.tx_hash,
      });
    }
  });
});

app.post('/restore_from_mnemonic', (req, res) => {
  if (!req.body.mnemonic) {
    res.status(400).json({
      success: false
    });
    return;
  }

  try {
    const walletData = monero_utils.seed_and_keys_from_mnemonic(req.body.mnemonic, 0);
    res.json({
      success: true,
      public_view_key: walletData.pub_viewKey_string,
      public_spend_key: walletData.pub_spendKey_string,
      private_view_key: walletData.sec_viewKey_string,
      private_spend_key: walletData.sec_spendKey_string,
      address: walletData.address_string
    })
  } catch (e) {
    if (e.includes("Please") || e.includes("Invalid"))
      res.status(200).json({
        success: false
      });
    else
      res.status(500).json({
        success: false,
        err_msg: e
      });
  }
});

app.post('/restore_from_keys', (req, res) => {
  if (!req.body.address || !req.body.private_view_key || !req.body.private_spend_key) {
    res.status(400).json({
      success: false
    });
    return;
  }

  try {
    const walletData = monero_utils.validate_components_for_login(req.body.address, req.body.private_view_key, req.body.private_spend_key, "", 0);

    res.status(200).json({
      public_view_key: walletData.pub_viewKey_string,
      public_spend_key: walletData.pub_spendKey_string,
      success: true
    });
  } catch (e) {
    if (e.includes("Address doesn't match")) {
      res.status(200).json({
        success: false
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Unknown error occurred restoring wallet from private keys"
      });
    }
  }
});

app.listen(process.env.PORT, () =>
  console.log(`Mobile Wallet API listening on port ${process.env.PORT}!`),
);
