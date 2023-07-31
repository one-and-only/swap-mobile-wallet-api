import { } from 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { BullMonitorExpress } from '@bull-monitor/express';
import { BullMQAdapter } from "@bull-monitor/root/dist/bullmq-adapter.js";
import { promisify } from "node:util";
import kleur from 'kleur';
import { createInterface as rl_create_interface } from 'node:readline';

import monero_utils_promise from "./myswap-core-js/monero_utils/MyMoneroCoreBridge.js";
import coreBridge_instance from './myswap-core-js/monero_utils/MyMoneroCoreBridge.js';
import monero_amount_format_utils from "./myswap-core-js/node_modules/@mymonero/mymonero-money-format/index.js";

import process_block, { block_count } from './utils/scan.js';
import get_random_outputs from "./utils/generate-random-outs.js";

const sleep = promisify(setTimeout);
var express_server;

async function sigint_hook() {
  api_shutting_down = true;

  let jobs_remaining = (await wallet_scan_queue.getJobs("active")).length;
  while (jobs_remaining > 0) {
    console.log(kleur.white().bgBlue(`Waiting for ${jobs_remaining} job${jobs_remaining > 1 ? "s" : ""} to finish...`));
    await sleep(1000);
    jobs_remaining = (await wallet_scan_queue.getJobs("active")).length;
  }

  express_server.close();
  await wallet_scan_worker.close();
  await wallet_scan_queue.close();
  await redis.quit();
  console.log(kleur.bgWhite().green("Goodbye!"));
}

if (process.platform === "win32") {
  var rl = rl_create_interface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on("SIGINT", async () => {
    await sigint_hook();
    process.emit("SIGINT");
  });
}

process.on('SIGINT', async () => {
  await sigint_hook();
  process.exit();
});

const send_status_message_mapping = {
  1: "Fetching wallet balance",
  2: "Calculating fee",
  3: "Fetching ring members",
  4: "Building transaction",
  5: "Submitting transaction"
};

import fetch from "node-fetch";

let api_shutting_down = false;

const monero_utils = await monero_utils_promise();
const core_bridge = await coreBridge_instance();

const block_update_thread_priority = parseInt(process.env.BLOCK_COUNT_UPDATE_JOB_QUEUE_PRIORITY);
const wallet_scan_thread_priority = parseInt(process.env.WALLET_SCAN_JOB_QUEUE_PRIORITY);
const chain_height_update_interval_sec = parseInt(process.env.CHAIN_HEIGHT_UPDATE_INTERVAL_SEC);

const redis = new IORedis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null
});

const wallet_scan_queue = new Queue("Wallet Scan", {
  connection: redis
});

async function wallet_process_function(job) {
  let current_height = await block_count();
  let scanned_height = from_height - 1;
  const transactions = [];
  // TODO change keys.* to data from the job
  const user_key_image = core_bridge.generate_key_image(keys.public_view, keys.private_view, keys.public_spend, keys.private_spend, 0);

  while (scanned_height < current_height) {
    const block_scan_result = await process_block(scanned_height + 1, keys, user_key_image, swap_core_bridge);

    if (block_scan_result.success) {
      transactions.push(block_scan_result.transactions);
    }

    scanned_height++;
    current_height = await block_count();
  }
}

async function block_height_update_function(job) {
  try {
    process.env.CURRENT_BLOCKCHAIN_HEIGHT = await block_count();
  } catch (e) {
    console.error(`Failed to update blockchain height: ${e}`);
    job.moveToFailed();
  }
}

const wallet_scan_worker = new Worker("Wallet Scan", async job => {
  while (!api_shutting_down) {
    switch (job.data.function) {
      case "block_height":
        await block_height_update_function(job);
        console.log(process.env.CURRENT_BLOCKCHAIN_HEIGHT);
        break;
      case "wallet_process":
        //! doing a "const _" in case there may be some data that I want to use, not sure yet
        const _ = await wallet_process_function(job);
        break;
      default:
        console.error("Invalid function name");
    }

    if (job.data.function === "block_height") {
      await sleep(chain_height_update_interval_sec * 1000);
    }
  }
}, {
  connection: redis
});

wallet_scan_queue.add("Chain Height Update Thread", { function: "block_height" }, {
  priority: block_update_thread_priority, // usually this would be the highest priority, but you can set the priority you want in process.env
});

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.disable('x-powered-by');
app.disable('etag');

const monitor = new BullMonitorExpress({
  queues: [
    new BullMQAdapter(wallet_scan_queue, { readonly: true }),
  ],
  gqlIntrospection: false
});
await monitor.init();
app.use('/queue_info', monitor.router);

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

express_server = app.listen(process.env.PORT, () =>
  console.log(`Mobile Wallet API listening on port ${process.env.PORT}!`),
);
