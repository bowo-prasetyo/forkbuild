import { computed, inject, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { GuideLibrary } from '../../application/help/GuideLibrary.js';
import { searchGuide } from '../../core/help/GuideSearch.js';
import { splitWordList } from '../../core/library/LibrarySearch.js';
import { currentLocale, t } from '../i18n/i18n.js';
import { userGuideDirectory, userGuideSectionUrl, userGuideUrl } from '../i18n/userGuide.js';

// Help (`/help?q=…`): a question in a player's own words answered from the
// user guide in their language (core/help/GuideSearch.js), with no model and
// nothing sent anywhere: the guide is read from this site the first time
// (application/help/GuideLibrary.js) and kept for offline use. Each answer is
// a section of the guide, its most telling paragraph first, the whole section
// a click away, and its place in the guide on GitHub linked.

// One guide per visit, read once, shared by every visit to Help.
const sharedLibrary = new GuideLibrary();

export default {
    name: 'HelpView',
    setup() {
        const route = useRoute();
        const router = useRouter();
        const library = inject('guideLibrary', null) || sharedLibrary;
        const code = currentLocale().code;
        const question = ref(typeof route.query.q === 'string' ? route.query.q : '');
        const guide = ref(null);
        const state = ref('loading');
        const opened = ref(new Set());
        const ignoredWords = splitWordList(t('help.ignoredWords'));

        onMounted(async () => {
            try {
                guide.value = await library.load(userGuideDirectory(code));
                state.value = 'ready';
            } catch {
                state.value = 'failed';
            }
        });

        // The question stays in the address, so Back and a shared link keep it.
        watch(question, (value) => {
            router.replace({ path: '/help', query: value.trim() ? { q: value } : {} }).catch(() => {});
            opened.value = new Set();
        });

        const answers = computed(() => (guide.value && question.value.trim()
            ? searchGuide(question.value, guide.value.index, { ignoredWords })
            : []));

        function key(answer) {
            return `${answer.section.file}#${answer.section.anchor}`;
        }
        function toggle(answer) {
            const next = new Set(opened.value);
            if (next.has(key(answer))) next.delete(key(answer));
            else next.add(key(answer));
            opened.value = next;
        }
        function where(answer) {
            return answer.section.chapter && answer.section.chapter !== answer.section.heading
                ? t('help.where', { chapter: answer.section.chapter, section: answer.section.heading })
                : answer.section.heading;
        }
        const examples = splitWordList(t('help.examples'));

        return {
            t, question, state, answers, opened, examples, key, toggle, where,
            sectionUrl: (answer) => userGuideSectionUrl(code, answer.section.file, answer.section.anchor),
            guideUrl: userGuideUrl(code)
        };
    },
    template: `
        <section class="help-view">
            <h1>{{ t('help.title') }}</h1>
            <p class="help-lead">{{ t('help.lead') }}</p>
            <form class="help-form" role="search" @submit.prevent>
                <input
                    v-model="question"
                    type="search"
                    class="form-input help-question"
                    :placeholder="t('help.placeholder')"
                    :aria-label="t('help.label')"
                    autofocus
                />
            </form>
            <p v-if="state === 'loading'" class="help-status" role="status">{{ t('help.loading') }}</p>
            <p v-else-if="state === 'failed'" class="help-status" role="status">
                {{ t('help.failed') }} <a :href="guideUrl" target="_blank" rel="noopener">{{ t('help.openGuide') }}</a>
            </p>
            <template v-else>
                <div v-if="!question.trim()" class="help-examples">
                    <span>{{ t('help.tryAsking') }}</span>
                    <button v-for="example in examples" :key="example" type="button" class="action-btn" @click="question = example">{{ example }}</button>
                </div>
                <p v-else-if="answers.length === 0" class="help-status" role="status">
                    {{ t('help.nothingFound') }} <a :href="guideUrl" target="_blank" rel="noopener">{{ t('help.openGuide') }}</a>
                </p>
                <ol v-else class="help-answers" :aria-label="t('help.answers')">
                    <li v-for="answer in answers" :key="key(answer)" class="help-answer">
                        <h2 class="help-answer-title">{{ where(answer) }}</h2>
                        <template v-if="opened.has(key(answer))">
                            <p v-for="(paragraph, i) in answer.section.paragraphs" :key="i">{{ paragraph }}</p>
                        </template>
                        <p v-else>{{ answer.snippet }}</p>
                        <div class="help-answer-actions">
                            <button v-if="answer.section.paragraphs.length > 1 || answer.snippet !== answer.section.paragraphs[0]" type="button" class="action-btn" :aria-expanded="opened.has(key(answer)) ? 'true' : 'false'" @click="toggle(answer)">
                                {{ opened.has(key(answer)) ? t('help.showLess') : t('help.showAll') }}
                            </button>
                            <a :href="sectionUrl(answer)" target="_blank" rel="noopener">{{ t('help.inTheGuide') }}</a>
                        </div>
                    </li>
                </ol>
            </template>
        </section>
    `
};
