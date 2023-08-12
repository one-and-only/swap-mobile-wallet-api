const IORedis = require('ioredis');
const sleep = require('node:util').promisify(setTimeout);

const chain_height_update_interval_sec = parseInt(process.env.CHAIN_HEIGHT_UPDATE_INTERVAL_SEC);

const redis = new IORedis({
    host: process.env.BULLMQ_REDIS_HOST,
    port: parseInt(process.env.BULLMQ_REDIS_PORT),
    maxRetriesPerRequest: null
});

function collect_garbage() {
    try {
        global.gc();
    } catch (e) {
        console.warn("Garbage collection not allowed. Are you using `--expose-gc`?");
    }
}

module.exports = async (job) => {
    const chain_scan_utils = await import('./utils/scan.js');
    const core_bridge = await require('./myswap-core-js/monero_utils/MyMoneroCoreBridge.js')();

    async function wallet_process_function(job) {
        const wallet_scan_status = JSON.parse(await redis.get(`wallet_scan_status|${job.data.address_hash}`));
        let transactions = [];
        const user_key_image = core_bridge.generate_key_image(job.data.keys.public_view, job.data.keys.private_view, job.data.keys.public_spend, job.data.keys.private_spend, 0);

        while (wallet_scan_status.scanned_height < global.CURRENT_BLOCKCHAIN_HEIGHT) {
            // since this is a long-running job, we need to check if the API wants to shut down and quit
            if ((await redis.get("api_shutting_down")) === "true") {
                return;
            }

            const block_scan_result = await chain_scan_utils.process_block(scanned_height + 1, job.data.keys, user_key_image, core_bridge);

            if (block_scan_result.success) {
                transactions.push(block_scan_result.transactions);
            }

            wallet_scan_status.scanned_height++;
            await redis.set(`wallet_scan_status|${job.data.address_hash}`, JSON.stringify(wallet_scan_status));
        }

        // TODO: encrypt and store transaction bundle

        transactions = [];
        wallet_scan_status.scanned_fully = true;
        wallet_scan_status.bundle_available = true;
        await redis.set(`wallet_scan_status|${job.data.address_hash}`, JSON.stringify(wallet_scan_status));
    }

    async function block_height_update_function(job) {
        try {
            global.CURRENT_BLOCKCHAIN_HEIGHT = await chain_scan_utils.block_count();
        } catch (e) {
            console.error(`Failed to update blockchain height: ${e}`);
        }
    }

    while ((await redis.get("api_shutting_down")) === "false") {
        switch (job.data.function) {
            case "block_height":
                await block_height_update_function(job);
                break;
            case "wallet_process":
                await wallet_process_function(job);
                break;
            default:
                console.error("Invalid function name");
        }

        if (job.data.function === "block_height") await sleep(chain_height_update_interval_sec * 1000);

        if (job.data.function === "wallet_process") collect_garbage(); // just in case, large amounts of RAM being used by this function
    }
};