// Relais de recette local : aucune remise de message à un destinataire extérieur.
const net = require('node:net');
const fs = require('node:fs');
net.createServer(socket => {
  socket.write('220 recette.local ESMTP\r\n');
  let buffer = '', data = false, message = '';
  socket.on('data', chunk => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\r\n')) >= 0) {
      const ligne = buffer.slice(0, i); buffer = buffer.slice(i + 2);
      if (data) {
        if (ligne === '.') {
          fs.appendFileSync('/recette/mail.txt', message + '\n');
          message = ''; data = false; socket.write('250 accepted\r\n');
        } else message += ligne + '\n';
      } else if (/^(EHLO|HELO)/i.test(ligne)) socket.write('250 recette.local\r\n');
      else if (/^DATA/i.test(ligne)) { data = true; socket.write('354 end with dot\r\n'); }
      else if (/^QUIT/i.test(ligne)) socket.end('221 bye\r\n');
      else socket.write('250 OK\r\n');
    }
  });
}).listen(2525, '0.0.0.0');
