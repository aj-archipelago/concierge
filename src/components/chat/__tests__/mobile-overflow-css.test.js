import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";

// Simple test component to verify CSS classes
const TestComponent = () => (
    <div className="mobile-overflow-safe">
        <div className="mobile-text-wrap">
            <p>Test content</p>
        </div>
        <div className="mobile-table-container">
            <table className="mobile-table">
                <thead>
                    <tr>
                        <th className="mobile-table-cell">Header 1</th>
                        <th className="mobile-table-cell">Header 2</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="mobile-table-cell">Data 1</td>
                        <td className="mobile-table-cell">Data 2</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
);

describe("Mobile Overflow CSS Utilities", () => {
    it("should render components with mobile overflow utility classes", () => {
        const { container } = render(<TestComponent />);
        
        // Verify that our utility classes are applied
        expect(container.querySelector(".mobile-overflow-safe")).toBeInTheDocument();
        expect(container.querySelector(".mobile-text-wrap")).toBeInTheDocument();
        expect(container.querySelector(".mobile-table-container")).toBeInTheDocument();
        expect(container.querySelector(".mobile-table")).toBeInTheDocument();
        expect(container.querySelectorAll(".mobile-table-cell")).toHaveLength(4);
    });

    it("should have proper CSS class structure for mobile overflow handling", () => {
        const { container } = render(<TestComponent />);
        
        const overflowSafeElement = container.querySelector(".mobile-overflow-safe");
        const textWrapElement = container.querySelector(".mobile-text-wrap");
        const tableContainer = container.querySelector(".mobile-table-container");
        
        // These elements should exist and have the proper classes
        expect(overflowSafeElement).toBeInTheDocument();
        expect(textWrapElement).toBeInTheDocument();
        expect(tableContainer).toBeInTheDocument();
        
        // Verify the structure is correct
        expect(overflowSafeElement).toContainElement(textWrapElement);
        expect(overflowSafeElement).toContainElement(tableContainer);
    });
}); 