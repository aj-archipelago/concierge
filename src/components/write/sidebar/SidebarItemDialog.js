import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import SidebarItemContent from "./SidebarItemContent";

export default function SidebarItemDialog({
    show,
    onHide,
    inputText,
    name,
    icon,
    output,
    query,
    Options,
    onGenerate,
    defaultParameters,
    renderOutput,
}) {
    return (
        <Dialog
            open={show}
            onOpenChange={(open) => {
                if (!open) {
                    onHide();
                }
            }}
        >
            <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {icon}
                        {name}
                    </DialogTitle>
                </DialogHeader>
                <div className="mt-4">
                    <SidebarItemContent
                        inputText={inputText}
                        name={name}
                        icon={icon}
                        output={output}
                        query={query}
                        Options={Options}
                        onGenerate={onGenerate}
                        defaultParameters={defaultParameters}
                        renderOutput={renderOutput}
                        autoLoad={true}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
