const fs = require('fs');
const pngToIco = require('png-to-ico');

pngToIco('icon.png')
    .then(buf => {
        fs.writeFileSync('icon.ico', buf);
        console.log('Successfully created icon.ico');
    })
    .catch(console.error);
