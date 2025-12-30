const dns = require('dns');

const hostname = '_mongodb._tcp.cluster0.phudmlq.mongodb.net';

console.log(`Attempting to resolve SRV record for: ${hostname}`);

dns.resolveSrv(hostname, (err, addresses) => {
  if (err) {
    console.error('DNS Resolution Failed:', err);
    console.log('\nPossible causes:');
    console.log('1. No internet connection.');
    console.log('2. DNS server blocking MongoDB SRV records (common with some ISPs or corporate networks).');
    console.log('3. Typo in the connection string (though this looks like a valid Atlas address).');
  } else {
    console.log('DNS Resolution Successful!');
    console.log('SRV Records:', addresses);
    console.log('\nIf DNS works but connection fails, check IP Whitelist in MongoDB Atlas.');
  }
});
