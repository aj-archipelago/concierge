import { act, renderHook } from "@testing-library/react";
import { useChatEntitySelection } from "../useChatEntitySelection";

const personal = { id: "personal-1" };
const colleague = { id: "colleague-1" };
const props = (overrides = {}) => ({
    chat: { _id: "chat-1", selectedEntityId: colleague.id },
    entities: [personal],
    defaultEntityId: personal.id,
    entitiesLoaded: false,
    readOnly: false,
    updateChat: jest.fn(),
    ...overrides,
});

it("keeps a colleague target through stale, failed, and refreshed listings without saving a fallback", () => {
    const initial = props();
    const { result, rerender } = renderHook(useChatEntitySelection, {
        initialProps: initial,
    });
    expect(result.current.selectedEntityId).toBe(colleague.id);
    rerender({ ...initial, entities: [], defaultEntityId: "default" });
    expect(result.current.selectedEntityId).toBe(colleague.id);
    rerender({ ...initial, entitiesLoaded: true });
    expect(result.current.selectedEntityId).toBe(colleague.id);
    rerender({
        ...initial,
        entitiesLoaded: true,
        entities: [personal, colleague],
    });
    expect(result.current.selectedEntityId).toBe(colleague.id);
    expect(initial.updateChat).not.toHaveBeenCalled();
});

it("uses the new chat's target immediately when navigating from another chat", () => {
    const initial = props({
        chat: { _id: "old-chat", selectedEntityId: personal.id },
    });
    const { result, rerender } = renderHook(useChatEntitySelection, {
        initialProps: initial,
    });
    expect(result.current.selectedEntityId).toBe(personal.id);
    rerender({
        ...initial,
        chat: { _id: "new-chat", selectedEntityId: colleague.id },
    });
    expect(result.current.selectedEntityId).toBe(colleague.id);
    expect(initial.updateChat).not.toHaveBeenCalled();
});

it("allows an explicit switch and follows the persisted selection after saving", () => {
    const initial = props({
        entitiesLoaded: true,
        entities: [personal, colleague],
    });
    const { result, rerender } = renderHook(useChatEntitySelection, {
        initialProps: initial,
    });
    act(() => result.current.setSelectedEntityId(personal.id));
    expect(result.current.selectedEntityId).toBe(personal.id);
    rerender({
        ...initial,
        chat: { ...initial.chat, selectedEntityId: personal.id },
    });
    expect(result.current.selectedEntityId).toBe(personal.id);
    expect(initial.updateChat).not.toHaveBeenCalled();
});

it("repairs a legacy stale entity only after the authoritative listing finishes", () => {
    const initial = props({
        chat: { _id: "chat-1", selectedEntityId: "retired-legacy-entity" },
    });
    const { result, rerender } = renderHook(useChatEntitySelection, {
        initialProps: initial,
    });
    expect(result.current.selectedEntityId).toBe("retired-legacy-entity");
    expect(initial.updateChat).not.toHaveBeenCalled();
    rerender({ ...initial, entitiesLoaded: true });
    expect(result.current.selectedEntityId).toBe(personal.id);
    expect(initial.updateChat).toHaveBeenCalledTimes(1);
    expect(initial.updateChat).toHaveBeenCalledWith({
        chatId: "chat-1",
        selectedEntityId: personal.id,
    });
    rerender({
        ...initial,
        entitiesLoaded: true,
        entities: [...initial.entities],
    });
    expect(initial.updateChat).toHaveBeenCalledTimes(1);
});

it("does not repair a read-only chat", () => {
    const initial = props({
        chat: {
            _id: "chat-1",
            selectedEntityId: "retired-entity",
            readOnly: true,
        },
        entitiesLoaded: true,
    });
    renderHook(useChatEntitySelection, { initialProps: initial });
    expect(initial.updateChat).not.toHaveBeenCalled();
});

it("uses the default for an empty chat and preserves an explicit colleague selection", () => {
    const initial = props({ chat: null });
    const { result, rerender } = renderHook(useChatEntitySelection, {
        initialProps: initial,
    });
    expect(result.current.selectedEntityId).toBe(personal.id);
    act(() => result.current.setSelectedEntityId(colleague.id));
    rerender({ ...initial, entitiesLoaded: true });
    expect(result.current.selectedEntityId).toBe(colleague.id);
});

it("keeps a newly chosen shared assistant while its exact metadata is loading", () => {
    const initial = props({
        chat: { _id: "chat-1", selectedEntityId: personal.id },
        entitiesLoaded: true,
    });
    const { result } = renderHook(useChatEntitySelection, {
        initialProps: initial,
    });
    act(() => result.current.setSelectedEntityId("shared-specialist-off-page"));
    expect(result.current.selectedEntityId).toBe("shared-specialist-off-page");
    expect(initial.updateChat).not.toHaveBeenCalled();
});
