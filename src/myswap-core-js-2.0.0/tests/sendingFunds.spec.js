// Copyright (c) 2014-2018, MyMonero.com
//
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without modification, are
// permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this list of
//	conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice, this list
//	of conditions and the following disclaimer in the documentation and/or other
//	materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its contributors may be
//	used to endorse or promote products derived from this software without specific
//	prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
// THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
// PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
// STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
// THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

"use strict";
const mymonero_core_js = require("../");
const JSBigInt = mymonero_core_js.JSBigInt;
const fetch = require("node-fetch");
const { json } = require("express");

class APIClient
{
	constructor(options)
	{
		const self = this
		self.options = options
		self.fetch = options.fetch
		if (self.fetch == null || typeof self.fetch == 'undefined') {
			throw new Error("APIClient requires options.fetch")
		}
		self.hostBaseURL = options.hostBaseURL || "http://localhost:9100/" // must include trailing /
	}	
	//
	// Getting outputs for sending funds
	UnspentOuts(parameters, fn)
	{ // -> RequestHandle
		const self = this
		const endpointPath = 'get_unspent_outs'
		self.fetch.post(
			self.hostBaseURL + endpointPath, parameters
		).then(function(data) {
			fn(null, data)
		}).catch(function(e) {
			fn(e && e.Error ? e.Error : ""+e);
		});
		const requestHandle = 
		{
			abort: function()
			{
				console.warn("TODO: abort!")
			}
		}
		return requestHandle
	}
	//
	RandomOuts(parameters, fn)
	{ // -> RequestHandle
		const self = this
		const endpointPath = 'get_random_outs'
		self.fetch.post(
			self.hostBaseURL + endpointPath, parameters
		).then(function(data) {
			fn(null, data)
		}).catch(function(e) {
			fn(e && e.Error ? e.Error : ""+e);
		});
		const requestHandle = 
		{
			abort: function()
			{
				console.warn("TODO: abort!")
			}
		}
		return requestHandle
	}
	//
	// Runtime - Imperatives - Public - Sending funds
	SubmitRawTx(parameters, fn)
	{
		const self = this
		const endpointPath = 'submit_raw_tx'
		self.fetch.post(
			self.hostBaseURL + endpointPath, parameters
		).then(function(data) {
			fn(null, data)
		}).catch(function(e) {
			fn(e && e.Error ? e.Error : ""+e);
		});
		const requestHandle = 
		{
			abort: function()
			{
				console.warn("TODO: abort!")
			}
		}
		return requestHandle
	}
}
//
// This fetch API is of course not accurate
class Fetch
{
	constructor()
	{
	}
	post(url, params)
	{
		return new Promise(function(resolve, reject)
		{
			console.log("Mocked fetch url", url)
			if (url.indexOf("get_unspent_outs") !== -1) {
				var data = '{"address": "' + params.address + '", "view_key": "' + params.view_key + '","amount":"' + params.amount + '","mixin":10,"use_dust":' + params.use_dust + ',"dust_threshold":"' + params.dust_threshold + '"}';
				var outputs;
				var per_byte_fee;
				console.log("hitting up the API :P");
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
						/*deprecated*/// per_kb_fee: parseInt("24658"/*for str search*/) * 1024 // scale the per b we know up to per kib (so it can be scaled back down - interrim until all clients are ready for per b fee)
					});
					}).catch(err => console.log("Error " + err));
			} else if (url.indexOf("get_random_outs") !== -1) {
				var data = '{"amounts":["0","0"],"count":11}';
				fetch(
					"https://wallet.getswap.eu/api/get_random_outs",
					{
					  method: "POST",
					  headers: {
						"Content-Type": "application/json"
					  },
					  body: data
					}
				  ).then(response => response.json())
					.then((jsonResponse) => {
					  console.log(jsonResponse.status);
					  resolve({
						amount_outs: jsonResponse.amount_outs
					  })
					}).catch(err => console.log("Error " + err));
			} else if (url.indexOf("submit_raw_tx") !== -1) {
				resolve({}) // mocking tx submission success
			} else {
				reject("Fetch implementation doesn't know how to get url: " + url);
			}
		})
	}
}

async function foo ()
{
	const apiClient = new APIClient({ fetch: new Fetch() });
	const target_address = "fh3WtifRY76cBUtQhLQaBngvsYd6JT12ACHTUpzVNPN5KYHFmVHKhBWMTZvguqz87f9LbTzWnQUxviSfp8EBQBKF1eS9YMEhq"
	const is_sweeping = false;
	const entered_amount = "0.01";
	var sending_amount; // possibly need this ; here for the JS parser
	if (is_sweeping) {
		sending_amount = "0"
	} else {
		try {
			sending_amount = (mymonero_core_js.monero_amount_format_utils.parseMoney(entered_amount)).toString();
		} catch (e) {
			throw new Error(`Couldn't parse amount ${amount}: ${e}`)
		}
	}
	const simple_priority = 1;
	const from_address = "fh3WtifRY76cBUtQhLQaBngvsYd6JT12ACHTUpzVNPN5KYHFmVHKhBWMTZvguqz87f9LbTzWnQUxviSfp8EBQBKF1eS9YMEhq";
	const sec_viewKey_string = "b758a9193651561fc7b248dc8287b56b801b534d12e82a8ecdcec0a0e89ecf09";
	const sec_spendKey_string = "5ffe04e0b6179907c5d911aba4cb2a7700a36d120a66779dd4c88dbf02465b0b";
	const pub_spendKey_string = "971539b1ecbdd254e930aff5f91deeb803cd7c01a90343760669982490c66ed6";
	const payment_id = null; 
	var coreBridge_instance;
	try {
		coreBridge_instance = await require('../monero_utils/MyMoneroCoreBridge')({ asmjs: undefined/*allow it to detect*/ });
	} catch (e) {
		console.error(e);
		return;
	}
	coreBridge_instance.async__send_funds({
		is_sweeping: is_sweeping, 
		payment_id_string: payment_id, // may be nil or undefined
		sending_amount: is_sweeping ? 0 : sending_amount, // sending amount
		from_address_string: from_address,
		sec_viewKey_string: sec_viewKey_string,
		sec_spendKey_string: sec_spendKey_string,
		pub_spendKey_string: pub_spendKey_string,
		to_address_string: target_address,
		priority: simple_priority,
		unlock_time: 0, // unlock_time 
		nettype: mymonero_core_js.nettype_utils.network_type.MAINNET,
		//
		get_unspent_outs_fn: function(req_params, cb)
		{
			apiClient.UnspentOuts(req_params, function(err_msg, res)
			{
				cb(err_msg, res);
			});
		},
		get_random_outs_fn: function(req_params, cb)
		{
			apiClient.RandomOuts(req_params, function(err_msg, res)
			{
				cb(err_msg, res);
			});
		},
		submit_raw_tx_fn: function(req_params, cb)
		{
			apiClient.SubmitRawTx(req_params, function(err_msg, res)
			{
				cb(err_msg, res);
			});
		},
		//
		status_update_fn: function(params)
		{
			console.log("> Send funds step " + params.code + ": " + mymonero_core_js.monero_sendingFunds_utils.SendFunds_ProcessStep_MessageSuffix[params.code])
		},
		error_fn: function(params)
		{
			console.log("Error occurred.... ", params.err_msg)
			throw new Error("SendFunds err:" + params.err_msg)
		},
		success_fn: function(params)
		{
			console.log("Sendfunds success")
			console.log("sentAmount", params.total_sent)
			console.log("final__payment_id", params.final_payment_id)
			console.log("tx_hash", params.tx_hash)
			console.log("tx_fee", params.used_fee)
			console.log("tx_key", params.tx_key)
			console.log("tx_hash", params.tx_hash)
			console.log("tx_pub_key", params.tx_pub_key)
		}
	});
};

foo();
