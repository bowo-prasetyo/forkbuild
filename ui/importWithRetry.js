// Runs a dynamic import, trying again with backoff when it fails. The app is
// hundreds of unbundled modules; when the host drops or refuses even one of
// the requests an import makes (GitHub Pages does this under a burst, seen in
// Firefox), the browser rejects the whole import and nothing in it runs. No
// module is evaluated until its whole graph has loaded, so trying again is
// safe: the modules that did arrive come back from the HTTP cache and only
// the missing ones are requested again.
export async function importWithRetry(load, retryDelaysMs = [500, 1000, 2000, 4000, 8000]) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await load();
        } catch (error) {
            if (attempt >= retryDelaysMs.length) throw error;
            console.warn(`Loading part of the app failed; retrying (${attempt + 1}/${retryDelaysMs.length}).`, error);
            await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
        }
    }
}
