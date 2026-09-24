renderer/Renderer.js builds the rendering stack in this order. Editor View
(application/world/RenderWorldUseCase.js) and World View
(application/world/RenderWorldViewUseCase.js) both construct it the same way.

Editor View / World View

↓

Renderer (THREE.WebGLRenderer)

↓

Scene (SceneManager)

↓

Camera (CameraController)

↓

Lights

↓

Grid (GridHelper)

↓

Terrain streaming: four TerrainStreamingControllers (terrain, vegetation,
water, wildlife; see docs/Architecture.md, "Terrain layers")

↓

Render Loop (AnimationLoop, started by Renderer#start())

The use case then attaches a WorldRenderer to the Renderer and subscribes
it to the domain EventBus before calling start().
