import { RuntimePlayer } from '@monorepo/runtime-player';

let player: RuntimePlayer | null = null;

self.onmessage = (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'init':
      player = new RuntimePlayer(payload);
      break;
    case 'load':
      if (player) {
        player.load(payload);
      }
      break;
    case 'play':
      if (player) {
        player.play();
      }
      break;
    case 'pause':
      if (player) {
        player.pause();
      }
      break;
    case 'seek':
      if (player) {
        player.seek(payload);
      }
      break;
    case 'setViewport':
      if (player) {
        player.setViewport(payload);
      }
      break;
  }
};
