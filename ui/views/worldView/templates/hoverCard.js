// World view template: the hover card, floating over the viewport's bottom-right corner.
// Kept out of the left panel so hovering never shifts the panel's content.
// It renders in WorldView's scope, so it uses the names its setup() returns.
export const hoverCardTemplate = `<div v-if="spatialHover" class="spatial-panel spatial-panel--hover world-view-hover-card">
                <h4>Hover</h4>
                <p class="spatial-type">{{ spatialHover.type }}</p>
                <p v-if="spatialHover.worldTitle" class="spatial-world">
                    World: {{ spatialHover.worldTitle }}
                    <span class="spatial-author">by {{ spatialHover.worldAuthor }}</span>
                </p>
                <p v-if="spatialHover.brickId" class="spatial-id">
                    Brick: {{ spatialHover.brickId.slice(0, 8) }}…
                </p>
                <p v-if="spatialHover.position" class="spatial-pos">
                    {{ spatialHover.position.x.toFixed(2) }},
                    {{ spatialHover.position.y.toFixed(2) }},
                    {{ spatialHover.position.z.toFixed(2) }}
                </p>
            </div>`;
