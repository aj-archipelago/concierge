import TimeAgo from "javascript-time-ago";
import ar from "javascript-time-ago/locale/ar.json";
import en from "javascript-time-ago/locale/en.json";
import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import Chat from "./components/chat/Chat";
import Code from "./components/code/Code";
import ImagesPage from "./components/images/ImagesPage";
import TranscribePage from "./components/transcribe/TranscribePage";
import TranslatePage from "./components/translate/TranslatePage";
import Write from "./components/write/Write";
import "./i18n";
import reportWebVitals from "./reportWebVitals";

if (typeof document !== "undefined") {
    TimeAgo.addDefaultLocale(document.documentElement.lang === "ar" ? ar : en);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

const root = document.getElementById("labeeb-root");
const rootElement = ReactDOM.createRoot(root);

rootElement.render(
    <App>
        <Routes>
            <Route exact path="/" element={<Navigate to="/write" />} />
            <Route path="/images" element={<ImagesPage />}></Route>
            <Route path="/translate" element={<TranslatePage />}></Route>
            <Route path="/transcribe" element={<TranscribePage />}></Route>
            <Route path="/write" element={<Write />}></Route>
            <Route path="/code" element={<Code />}></Route>
            <Route path="/chat" element={<Chat />}></Route>
        </Routes>
    </App>,
);
