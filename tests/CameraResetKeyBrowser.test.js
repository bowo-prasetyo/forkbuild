// @environment browser
import { CameraController } from '../renderer/CameraController.js';
import { CameraState } from '../renderer/CameraState.js';
import { Position } from '../core/Position.js';
import { assert } from './support/Assert.js';

// The Editor's Home key resets the camera. A view that gives Home its own
// meaning (World View) passes resetKey: null and the key leaves the camera
// alone.

const away = new CameraState({ position: new Position(500, 40, 500), target: new Position(480, 0, 480) });

const near = (position, x, y, z) => Math.abs(position.x - x) < 1e-6 && Math.abs(position.y - y) < 1e-6 && Math.abs(position.z - z) < 1e-6;

function pressHome() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
}

{
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const controller = new CameraController(canvas, 1);
    controller.setState(away);
    pressHome();
    const { position } = controller.getState();
    assert(near(position, 10, 10, 10),
        `by default Home resets the camera — got ${position.x}, ${position.y}, ${position.z}`);
    controller.dispose();
    canvas.remove();
}

{
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const controller = new CameraController(canvas, 1, { resetKey: null });
    controller.setState(away);
    pressHome();
    const { position } = controller.getState();
    assert(near(position, 500, 40, 500),
        `with resetKey: null, Home leaves the camera where it is — got ${position.x}, ${position.y}, ${position.z}`);
    controller.dispose();
    canvas.remove();
}
