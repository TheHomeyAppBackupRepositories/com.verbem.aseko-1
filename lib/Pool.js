/* eslint-disable linebreak-style */
/* eslint-disable indent */
/* eslint-disable no-tabs */
/* eslint-disable object-curly-newline */
/* eslint-disable max-len */

'use strict';

// eslint-disable-next-line no-unused-vars
const axios = require('axios');
const url = require('url');

const API = 'V2';

class PoolLive {

	constructor(app) {
		this.unit = '';
		this.username = '';
		this.password = '';
		this.authorized = false;
		this.access_token = null;
		this.refresh_token = null;
		this.expiresAt = null;
		this.app = app;
		this.cookie;
	}

	async getMobileAccount({ username, password } = {}) {
		this.authorized = false;
		try {
			const uri = `https://pool.aseko.com/api/${API}/login`;
			const response = await axios.post(uri, {
				username, password, firebaseId: '',
			});
			this.access_token = response.data.accessToken;
			this.refresh_token = response.data.refreshToken;
			// this.app.log(this.access_token);
			this.authorized = true;
			this.username = username;
			this.password = password;
			return true;
		} 	catch (error) {
			this.app.log(JSON.stringify(error, ' ', 4));
			return error;
		}
	}

	async getWebAccount({ username, password } = {}) {
		try {
			const uri = 'https://pool.aseko.com/api/login';
			const response = await axios.post(uri, {
				username, password, agree: 'on', withCredentials: true,
			});
			this.cookie = response.headers['set-cookie'][0].split(' ')[0];
			return response.data;
		} 	catch (error) {
			this.app.log(JSON.stringify(error, ' ', 4));
			return error;
		}
	}

	// https://pool.aseko.com/api/logout

	async logoutWebAccount() {
		try {
			const uri = 'https://pool.aseko.com/api/logout';
			const response = await axios.post(uri, {
				headers: { Cookie: this.cookie },
			});
			return;
		} 	catch (error) {
			this.app.log(JSON.stringify(error, ' ', 4));
			return error;
		}
	}

	async refreshToken() {
		this.authorized = false;
		try {
			const uri = `https://pool.aseko.com/api/${API}/refresh`;
			const response = await axios.post(uri, {
				refreshToken: this.refresh_token,
			});
			this.access_token = response.data.accessToken;
			this.refresh_token = response.data.refreshToken;
			this.authorized = true;
			return true;
		} 	catch (error) {
			if (error.response && [401, 422, 500].includes(error.response.status)) {
				this.app.log('Refresh failed (401/422/500) do a new login', error.response.status);
				this.getMobileAccount({ username: this.username, password: this.password });
				return null;
			}
			this.app.log(JSON.stringify(error, ' ', 4));
			throw new Error(error);
		}
	}

	async getUnits() {
		if (!this.authorized) return null;

		let res;
		const uri = 'https://pool.aseko.com/api/v2/units';
		await axios.get(uri, { headers: { 'access-token': this.access_token } })
		.then((response) => res = response.data)
		.catch((error) => this.doError({ error }));
		return res;
	}

	// https://pool.aseko.com/api/units/110121464

	async getUnit({ unit } = {}) {
		if (!this.authorized) return null;

		let res;
		const uri = `https://pool.aseko.com/api/v2/units/${unit}`;
		await axios.get(uri, { headers: { 'access-token': this.access_token } })
		.then((response) => res = response.data)
		.catch((error) => this.doError({ error }));
		return res;
	}

	// https://pool.aseko.com/api/units/110121464

	async apiRequired({ unit } = {}) {
		if (!this.authorized) return null;

		let res;
		const uri = `https://pool.aseko.com/api/${API}/required/${unit}`;
		await axios.get(uri, { headers: { 'access-token': this.access_token } })
		.then((response) => res = response.data)
		.catch((error) => this.doError({ error }));
		return res;
	}

	// https://pool.aseko.com/api/${API}/consumables/110121464/

	async getConsumables({ unit } = {}) {
		if (!this.authorized) return null;

		let res;
		const uri = `https://pool.aseko.com/api/${API}/consumables/${unit}`;
		await axios.get(uri, { headers: { 'access-token': this.access_token } })
		.then((response) => res = response.data)
		.catch((error) => this.doError({ error }));
		return res;
	}

	// https://pool.aseko.com/api/${API}/consumables/110121464/

	async getTimeline({ unit } = {}) {
		if (!this.authorized) return null;

		let res;
		const uri = `https://pool.aseko.com/api/${API}/timeline/${unit}`;
		await axios.get(uri, { headers: { 'access-token': this.access_token } })
		.then((response) => res = response.data)
		.catch((error) => this.doError({ error }));
		return res;
	}

	// https://pool.aseko.com/api/configuration/110121464/

	async getConfiguration({ unit } = {}) {
		if (!this.authorized) return null;

		let res;
		const uri = `https://pool.aseko.com/api/configuration/${unit}`;
		await axios.get(uri, { headers: { Cookie: this.cookie }})
		.then((response) => res = response.data)
		.catch((error) => this.doError({ error }));
		return res;
	}

	doError({ error } = {}) {
		if (error.status === 401) {
			this.app.log('refresh token');
			this.refreshToken();
		} else this.app.error(JSON.stringify(error, ' ', 4));
		return null;
	}

}

module.exports = PoolLive;
