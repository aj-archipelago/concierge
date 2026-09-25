// jest.setup replaces History and Location with stubs. These tests need the
// browser contract: push/replace change the URL; traversals emit popstate.
export function installHomeHistory(
    url = "http://localhost/home",
    state = null,
) {
    let entries = [{ url, state }];
    let index = 0;
    const sync = () => {
        const current = new URL(entries[index].url);
        Object.assign(window.location, {
            href: current.href,
            search: current.search,
            pathname: current.pathname,
            hash: current.hash,
        });
        Object.defineProperty(window.history, "state", {
            configurable: true,
            value: entries[index].state,
        });
    };
    const traverse = (delta) => {
        const next = index + delta;
        if (next < 0 || next >= entries.length) return;
        index = next;
        sync();
        window.dispatchEvent(
            new PopStateEvent("popstate", { state: entries[index].state }),
        );
    };
    window.history.pushState = jest.fn((nextState, _, path) => {
        entries = entries.slice(0, index + 1);
        entries.push({
            state: nextState,
            url: new URL(path, entries[index].url).href,
        });
        index += 1;
        sync();
    });
    window.history.replaceState = jest.fn((nextState, _, path) => {
        entries[index] = {
            state: nextState,
            url: new URL(path, entries[index].url).href,
        };
        sync();
    });
    window.history.back = jest.fn(() => traverse(-1));
    window.history.forward = jest.fn(() => traverse(1));
    sync();
}
