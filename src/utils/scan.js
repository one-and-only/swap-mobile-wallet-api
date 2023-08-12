import fetch from "node-fetch";
import MyMoneroCoreBridgeClass from "../myswap-core-js/monero_utils/MyMoneroCoreBridgeClass.js";
import { } from "dotenv";

/**
 * Get the current blockchain height
 * @returns {Promise<number>} Blockchain height
 */
export async function block_count() {
    return (await (await (fetch(`${process.env.SWAP_RPC_ENDPOINT}/json_rpc`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "get_block_count"
        })
    }))).json()).result.count;
}

/**
 * Parse a transaction, given a TX object that is returned from a Monero-based daemon API
 * @param {object} tx Transaction that is being processed
 * @param {{ public_view: string, public_spend: string, private_view: string, private_spend: string }} keys User's wallet keys to use in various cryptographic functions
 * @param {string} user_key_image Cached key image for a user's wallet
 * @param {MyMoneroCoreBridgeClass} swap_core_bridge MyMonero-based crypto function helper
 * @returns {Promise<{ amount: number, tx_version: number, size_bytes: number, ringct: string, to_address: string, from_address: string }>}
 */
async function parse_transaction(tx, keys, user_key_image, swap_core_bridge) {
    const input_outputs = [];

    for (const input of tx.vin) {
        if (input.gen) continue; // coinbase input, thus belongs to no one

        const in_pub_key = input.target.key;
        const key_image_input = swap_core_bridge.generate_key_image(in_pub_key, keys.private_view, keys.public_spend, keys.private_spend, 0);

        if (key_image_input !== user_key_image) continue; // input doesn't belong to us
    }

    for (const output of tx.vout) {
        const out_pub_key = output.target.key;
        const key_image_output = swap_core_bridge.generate_key_image(out_pub_key, keys.private_view, keys.public_spend, keys.private_spend, 0);

        if (key_image_output !== user_key_image) continue; // output doesn't belong to us
    }

    const res = {
        tx_version: tx.version,
        ringct: `${tx.rct_signatures?.type ? `Yes, Type ${tx.rct_signatures.type}` : "No (Likely Coinbase)"}`
    };
}

/**
 * Scan and store various information about each transaction in a given block height
 * @param {number} height Which block height to scan
 * @param {{ public_view: string, public_spend: string, private_view: string, private_spend: string }} keys User's wallet keys to use in various cryptographic functions
 * @param {string} user_key_image Cached key image of a user's wallet
 * @param {MyMoneroCoreBridgeClass} swap_core_bridge MyMonero-based crypto function helper
 * @returns {Promise<{ transactions: { hash: string, timestamp: number, height: number, amount: number, tx_version: number, size_bytes: number, ringct: string, to_address: string, from_address: string }, success: boolean }>} Transaction information in requested block
 */
export async function process_block(height, keys, user_key_image, swap_core_bridge) {
    const transactions_result = [];
    const tx_hashes = [];

    const block_info = await (await fetch(`${process.env.SWAP_RPC_ENDPOINT}/json_rpc`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "get_block",
            params: {
                height: height
            }
        })
    })).json();
    const info_json = JSON.parse(block_info.result.json);

    info_json.tx_hashes.push(block_info.result.block_header.miner_tx_hash);

    const transaction_infos = await (await fetch(`${process.env.SWAP_RPC_ENDPOINT}/get_transactions`, {
        method: "POST",
        body: JSON.stringify({
            txs_hashes: info_json.tx_hashes,
            decode_as_json: true
        })
    })).json();

    for (let transaction of transaction_infos.txs) {
        const transaction_json = JSON.parse(transaction.as_json);
        const info = await parse_transaction(transaction_json, keys, user_key_image, swap_core_bridge);
        if (!info) continue;

        info.hash = transaction.tx_hash;
        info.timestamp = transaction.block_timestamp; // close enough
        info.height = transaction.block_height;
        info.size = transaction.as_hex.length / 2; // each hex character is 4 bits, 2 hex characters per byte
        transactions_result.push(info);
    }

    return transactions_result;
}