import {
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import * as amplitude from "@amplitude/analytics-browser";
import { useApolloClient } from "@apollo/client";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiRefreshCcw } from "react-icons/fi";
import stringcase from "stringcase";
import { SidebarContext } from "../Sidebar";
import { Loader2Icon } from "lucide-react";

const INPUT_THRESHOLD = 1;

export default function SidebarItem({
    inputText,
    name,
    icon,
    output = "",
    query,
    Options,
    onGenerate,
    defaultParameters,
    renderOutput,
}) {
    const key = stringcase.spinalcase(name);
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const client = useApolloClient();
    const [inputParameters, setInputParameters] = useState(defaultParameters);
    const [loadingComplete, setLoadingComplete] = useState(false);
    const { openItems } = useContext(SidebarContext);

    const isOpen = openItems.includes(key);

    const haveEnoughText = inputText && inputText.length > INPUT_THRESHOLD;

    const request = useCallback(async () => {
        if (haveEnoughText) {
            setLoading(true);
            client
                .query({
                    query: query.query,
                    variables: Object.assign(
                        {},
                        query.variables,
                        inputParameters,
                    ),
                    fetchPolicy: "network-only",
                })
                .then(({ data }) => {
                    amplitude.track("Query Completed", {
                        name,
                    });
                    setLoading(false);
                    onGenerate(data);
                    setLoadingComplete(true);
                });
        } else {
            onGenerate(null);
            setLoadingComplete(false);
        }
    }, [
        client,
        haveEnoughText,
        inputParameters,
        onGenerate,
        query.query,
        query.variables,
        name,
    ]);

    useEffect(() => {
        if (
            inputText &&
            inputText.length > INPUT_THRESHOLD &&
            isOpen &&
            !loading &&
            !loadingComplete
        ) {
            request();
        }
    }, [inputText, isOpen, loading, loadingComplete, request]);

    let message = null;

    if (loading) {
        message = t("Loading");
    } else {
        if (output.length === 0 && (loadingComplete || !haveEnoughText)) {
            message = t("No data");
        }
    }

    return (
        <AccordionItem value={key}>
            <AccordionTrigger className="">
                <div className="flex justify-between items-center w-full me-3">
                    <div
                        className="flex gap-1 items-center"
                        style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        {icon}&nbsp;
                        {t(name)}&nbsp;
                    </div>
                    {(loading || output.length > 0) && (
                        <div
                            className="refresh-button cursor-pointer"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                request();
                            }}
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2Icon
                                    size={15}
                                    className="animate-spin"
                                />
                            ) : (
                                <FiRefreshCcw className="text-gray-500" />
                            )}
                        </div>
                    )}
                </div>
            </AccordionTrigger>
            <AccordionContent>
                {Options && (
                    <Options
                        value={inputParameters}
                        onChange={(v) =>
                            setInputParameters(
                                Object.assign({}, inputParameters, v),
                            )
                        }
                        onCommit={() => request()}
                        loading={loading}
                    />
                )}
                {message && <div className="loading-container">{message}</div>}
                {loadingComplete && output.length > 0 && (
                    <>{renderOutput(output)}</>
                )}
            </AccordionContent>
        </AccordionItem>
    );
}
