import fs from 'fs';
import pngToIco from 'png-to-ico';

async function convert() {
    try {
        const buf = await pngToIco('icon.png');
        fs.writeFileSync('icon.ico', buf);
        console.log('Successfully created icon.ico');
    } catch (error) {
        console.error('Error creating icon:', error);
        process.exit(1);
    }
}

convert();
