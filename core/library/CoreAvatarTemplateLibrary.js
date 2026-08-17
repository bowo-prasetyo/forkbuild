import { AvatarTemplate } from '../AvatarTemplate.js';
import { AvatarAnimationState } from '../AvatarAnimationState.js';

// The built-in "core" avatar template library — mirrors
// core/library/CoreLibrary.js's shape exactly ({ id, <items> }), just
// for AvatarTemplate instead of BrickDefinition. 0.2.34 deliberately
// ships only BUILT-IN templates: no decentralized template
// distribution, no user-authored templates, nothing loaded from a
// remote source. A community avatar-template library can register
// alongside this one later the same way medieval:*/space:*/city:*
// brick libraries would — nothing here is privileged over them except
// being registered first.
const ALL_ANIMATIONS = Object.values(AvatarAnimationState);

export const CoreAvatarTemplateLibrary = {
    id: 'core',
    templates: [
        new AvatarTemplate({
            templateId: 'humanoid-01',
            body: 'humanoid',
            displayLabel: 'Humanoid 01',
            components: {
                skin: {
                    options: ['skin-01', 'skin-02', 'skin-03', 'skin-04', 'skin-05', 'skin-06'],
                    hasColor: false,
                    multiple: false
                },
                hair: {
                    options: [
                        'hair-01', 'hair-02', 'hair-03', 'hair-04', 'hair-05',
                        'hair-06', 'hair-07', 'hair-08', 'hair-09', 'hair-10'
                    ],
                    hasColor: true,
                    multiple: false
                },
                shirt: {
                    options: ['shirt-01', 'shirt-02', 'shirt-03', 'shirt-04', 'shirt-05', 'shirt-06'],
                    hasColor: true,
                    multiple: false
                },
                pants: {
                    options: ['pants-01', 'pants-02', 'pants-03', 'pants-04'],
                    hasColor: true,
                    multiple: false
                },
                accessories: {
                    options: ['glasses-01', 'hat-01', 'backpack-01', 'scarf-01'],
                    hasColor: false,
                    multiple: true
                }
            },
            supportedAnimations: ALL_ANIMATIONS,
            defaultAppearance: {
                skin: 'skin-03',
                hair: 'hair-01',
                hairColor: '#3b2416',
                shirt: 'shirt-01',
                shirtColor: '#3366cc',
                pants: 'pants-01',
                pantsColor: '#222222',
                accessories: []
            }
        }),
        // A second, deliberately smaller template — proves the
        // registry/validator genuinely branch per template rather
        // than having one hardcoded option set, and gives the Avatar
        // Creator (0.2.34 UI) a real second choice in the Template
        // dropdown.
        new AvatarTemplate({
            templateId: 'humanoid-02',
            body: 'humanoid',
            displayLabel: 'Humanoid 02 (Slim)',
            components: {
                skin: {
                    options: ['skin-01', 'skin-02', 'skin-03', 'skin-04'],
                    hasColor: false,
                    multiple: false
                },
                hair: {
                    options: ['hair-01', 'hair-02', 'hair-03', 'hair-04'],
                    hasColor: true,
                    multiple: false
                },
                shirt: {
                    options: ['shirt-01', 'shirt-02', 'shirt-03'],
                    hasColor: true,
                    multiple: false
                },
                pants: {
                    options: ['pants-01', 'pants-02'],
                    hasColor: true,
                    multiple: false
                },
                accessories: {
                    options: ['hat-01'],
                    hasColor: false,
                    multiple: true
                }
            },
            // Deliberately excludes RUNNING/JUMPING — this template
            // doesn't ship a rig for them yet. AvatarTemplate.
            // supportsAnimation() exists precisely so a future
            // movement milestone (0.2.36+) can ask "is this animation
            // even valid for this avatar" before playing it.
            supportedAnimations: [AvatarAnimationState.IDLE, AvatarAnimationState.WALKING],
            defaultAppearance: {
                skin: 'skin-01',
                hair: 'hair-02',
                hairColor: '#1a1a1a',
                shirt: 'shirt-02',
                shirtColor: '#444444',
                pants: 'pants-01',
                pantsColor: '#111111',
                accessories: []
            }
        })
    ]
};
