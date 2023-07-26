import { } from 'dotenv/config';
import cors from 'cors';
import express from 'express';

import monero_utils_promise from "./myswap-core-js/monero_utils/MyMoneroCoreBridge.js";
import coreBridge_instance from './myswap-core-js/monero_utils/MyMoneroCoreBridge.js';
import monero_amount_format_utils from "./myswap-core-js/node_modules/@mymonero/mymonero-money-format/index.js";

import get_random_outputs from "./utils/generate-random-outs.js";

const send_status_message_mapping = {
  1: "Fetching wallet balance",
  2: "Calculating fee",
  3: "Fetching ring members",
  4: "Building transaction",
  5: "Submitting transaction"
};

import fetch from "node-fetch";

const monero_utils = await monero_utils_promise();
const core_bridge = await coreBridge_instance();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.disable('x-powered-by');
app.disable('etag');

const send_funds_statuses = {};

app.get('/', (req, res) => {
  res.send('This API doesn\'t have a frontend, but at least you\'re here 😄');
});

app.get('/create_wallet', (req, res) => {
  const new_wallet = monero_utils.newly_created_wallet("en", 0);
  res.json({
    mnemonic: new_wallet.mnemonic_string,
    address: new_wallet.address_string,
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
    get_random_outputs(req.body.private_view_key).then(random_outpus => {
      fn(null, { amount_outs: random_outpus.amount_outs })
    }).catch(err => fn(err && err.Error ? err.Error : "" + err));
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
      if (!send_funds_statuses[req.body.from_address]) send_funds_statuses[req.body.from_address] = {};

      send_funds_statuses[req.body.from_address].send_step_number = params.code;
      send_funds_statuses[req.body.from_address].send_step_message = send_status_message_mapping[params.code];
    },
    error_fn: function (params) {
      res.status(500).json({
        success: false,
        error: `An unkown error occured while sending XWP: ${params.err_msg}`,
      });

      // transfer has been completed and is no longer pending
      delete send_funds_statuses[req.body.from_address];
    },
    success_fn: function (params) {
      const formattedFee = monero_amount_format_utils.parseMoney(params.used_fee).toString();
      res.json({
        success: true,
        used_fee: formattedFee,
        tx_hash: params.tx_hash,
      });

      // transfer has been completed and is no longer pending
      delete send_funds_statuses[req.body.from_address];
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

/**
 * Validate and restore wallet from private keys
 * @param {string} address Wallet address being restored from private keys
 * @param {string} private_view_key Private view key of the wallet being restored
 * @param {string} private_spend_key Private spend key of the wallet being restored
 * @returns {{code: number, public_view_key: string?, public_spend_key: string? }} public keys or error details
 */
function validate_restore_from_keys(address, private_view_key, private_spend_key) {
  try {
    const walletData = monero_utils.validate_components_for_login(address, private_view_key, private_spend_key, "", 0);

    return {
      code: 0,
      public_view_key: walletData.pub_viewKey_string,
      public_spend_key: walletData.pub_spendKey_string,
    };
  } catch (e) {
    if (e.includes("Address doesn't match")) {
      return {
        code: 2
      };
    } else {
      return {
        code: 1
      };
    }
  }
}

app.post('/restore_from_keys', (req, res) => {
  if (!req.body.address || !req.body.private_view_key || !req.body.private_spend_key) {
    res.status(400).json({
      success: false
    });
    return;
  }

  const restore_from_keys_result = validate_restore_from_keys(req.body.address, req.body.private_view_key, req.body.private_spend_key);

  res.status(restore_from_keys_result.code === 1 ? 500 : 200).json({
    success: restore_from_keys_result.code === 0,
    public_view_key: restore_from_keys_result.public_view_key ?? undefined,
    public_spend_key: restore_from_keys_result.public_spend_key ?? undefined
  });
});

app.post('/get_send_funds_status', (req, res) => {
  if (!req.body.address || !req.body.private_view_key || !req.body.private_spend_key) {
    res.status(400).json({
      success: false,
      error: "One or more required fields not given"
    });
    return;
  }

  if (validate_restore_from_keys(req.body.address, req.body.private_view_key, req.body.private_spend_key).code !== 0) {
    res.status(401).send({
      success: false,
      error: "Client failed private key authorization"
    });
    return;
  }

  if (!send_funds_statuses[req.body.address]) {
    res.status(200).json({
      success: true,
      error: "No pending sends for given address"
    });
    return;
  }

  const current_status = send_funds_statuses[address];
  return {
    send_step_number: current_status.send_step_number,
    send_step_message: current_status.send_step_message,
    success: true
  };
});

app.listen(process.env.PORT, () =>
  console.log(`Mobile Wallet API listening on port ${process.env.PORT}!`),
);
