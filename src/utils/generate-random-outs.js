import fetch from "node-fetch";
import { randomBytes } from "node:crypto";
import sodium from "libsodium-wrappers-sumo";

await sodium.ready;

function encode_amount(xwp_amount, amount_in_swapini = false) {
    const amount_string = xwp_amount.toString();

    let amountInAtomicUnits;
    if (amount_in_swapini) {
        amountInAtomicUnits = xwp_amount.toString();
    } else {
        if (!amount_string.includes(".")) {
            amountInAtomicUnits = amount_string !== 0 ? amount_string + "0".repeat(12) : "0"; // multiply by 1e12
        } else {
            const string_split = amount_string.split(".");
            const left_of_decimal = string_split[0];
            const right_of_decimal = string_split[1];

            amountInAtomicUnits = left_of_decimal + right_of_decimal + "0".repeat(12 - right_of_decimal.length);
        }
    }

    let amount = BigInt(amountInAtomicUnits);

    // Monero's variable-length integer encoding
    let buffer = [];
    do {
        let b = Number(amount % BigInt(128));
        amount = amount / BigInt(128);
        if (amount > 0n) {
            b |= 0x80;
        }
        buffer.push(b);
    } while (amount > 0n);

    const converted_amount = buffer.map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return converted_amount.padStart(64, "0");
}

function generate_ecdh_mask(output_public_key, private_view_key) {
    // Decode the private and public keys from hexadecimal strings
    const private_key_bytes = sodium.from_hex(private_view_key);
    const public_key_bytes = sodium.from_hex(output_public_key);

    // Perform ECDH calculation
    const shared_secret_bytes = sodium.crypto_scalarmult(private_key_bytes, public_key_bytes);

    // Derive the ECDH mask using a suitable cryptographic function (e.g. SHA-256)
    // and return the ECDH mask as a hexadecimal string
    const mask = sodium.to_hex(sodium.crypto_hash_sha256(shared_secret_bytes));
    return mask;
}

function generate_rct_field(output, private_view_key) {
    const mask = generate_ecdh_mask(output.key, private_view_key);
    let raw_amount = 0;
    if (output.cb_tx) {

    }
    const amount = encode_amount(0);
    return `${output.key}${mask}${amount}`;
}

// tbh I have no idea what I'm doing here
// isn't this just some fancy random number generator? No idea why all these steps are needed
// followed some of the mymonero-core-cpp code, but translated them into JS (mostly)
function get_random_output_index() {
    const r = parseInt(randomBytes(6).toString("hex"), 16);
    const frac = Math.sqrt(r);
    let i = Number((Math.floor((frac * 11) / (10 * Math.PI))).toFixed(0));
    return (i === 11 ? --i : i);
}

async function get_output_info(indexes) {
    let output_info = await (await fetch("http://autonode.getswap.eu:19952/get_outs", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            outputs: indexes.map(a => {
                return {
                    amount: 0,
                    index: a
                };
            }),
            get_txid: true
        })
    })).json();
    return output_info.outs;
}

export default async function find_random_outputs(private_view_key) {
    const res = {
        amount_outs: [
            {
                amount: 0,
                outputs: []
            }
        ]
    };

    // keep track of all indices so we don't use the same random output more than once
    // this is also the array where the desired random output indexes are kept
    const seen_indices = [];

    let trial_count = 0;

    //                   we want 11 ring members, as per Swap network maximum/recommendation
    while (seen_indices.length < 11) {
        const random_output_global_index = get_random_output_index();
        if (seen_indices.includes(random_output_global_index)) {
            trial_count++;
            continue;
        }

        seen_indices.push(random_output_global_index);
    }

    const random_output_info = await get_output_info(seen_indices);

    for (let i = 0; i < seen_indices.length; i++) {
        res.amount_outs[0].outputs.push({
            global_index: seen_indices[i],
            public_key: random_output_info[i].key
        });
    }

    for (let i = 0; i < seen_indices.length; i++) {
        res.amount_outs[0].outputs[i].rct = generate_rct_field(random_output_info[i], private_view_key);
    }

    return res;
}