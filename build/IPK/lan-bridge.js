/* Adapted from build/start.sh.example buildPolyfillScript(). The containing
 * HTML is still protected by DSH's original token/cookie authentication. */
(function() {
	var transport = globalThis.__DSH_TRANSPORT__ || (globalThis.__DSH_TRANSPORT__ = {});
	Object.defineProperty(transport, 'ownsHost', { value: true, writable: false, configurable: false });
	if (globalThis.crypto && !crypto.randomUUID && crypto.getRandomValues) {
		crypto.randomUUID = function() {
			return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function(c) {
				return (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
			});
		};
	}
})();
