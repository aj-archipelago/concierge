import React, { useState, useContext, useEffect } from "react";
import { Modal, Button, Form } from 'react-bootstrap';
import { AuthContext } from '../App';
import { useUpdateAiMemory } from "../../app/queries/options";
import { useTranslation } from "react-i18next";

const UserOptions = ({show, handleClose}) => {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const [aiMemory, setAiMemory] = useState(user.aiMemory || '');
    const [aiMemorySelfModify, setAiMemorySelfModify] = useState(user.aiMemorySelfModify || false);

    const updateAiMemoryMutation = useUpdateAiMemory();

    useEffect(() => {
        setAiMemory(user.aiMemory || '');
        setAiMemorySelfModify(user.aiMemorySelfModify || false);
    }, [user]);

    const handleSave = async () => {
        if (!user || !user.userId) {
            console.error('UserId not found');
            return;
        }

        await updateAiMemoryMutation.mutateAsync({ userId: user.userId, contextId: user.contextId, aiMemory, aiMemorySelfModify}); 
        handleClose();
    }

    return (
        <Modal 
            show={show} 
            onHide={handleClose}
            style={{fontSize: '0.875rem'}}
        >
            <Modal.Header style={{padding: '1rem'}}>
                <Modal.Title>{t("Options")}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form.Group style={{margin: '0.5rem', padding: '0.5rem'}}>
                    <Form.Label>{t("AI Memory")}</Form.Label>
                    <Form.Text
                        className="text-muted"
                        style={{ display: 'block' }}
                    >
                        {t("You can customize your interactions with the AI assistant by giving it things to remember. You can enter plain text or something more structured like JSON or XML. If you allow it, the AI will periodically modify its own memory to improve its ability to assist you, but it will likely rewrite the memory into a JSON object.")}
                    </Form.Text>
                    <Form.Check 
                        type="checkbox"
                        size="sm"
                        label={t("Allow the AI to modify its own memory")}
                        checked={aiMemorySelfModify} 
                        onChange={e => setAiMemorySelfModify(e.target.checked)}
                        style={{margin: '0.5rem 0'}}
                    />
                    <Form.Control
                        as="textarea"
                        value={aiMemory}
                        onChange={e => setAiMemory(e.target.value)}
                        style={{
                            height: '300px',
                            fontFamily: 'Courier New, monospace',
                            fontSize: '0.75rem',
                            padding: '10px',
                            margin: '0.5rem 0'
                        }}
                    />
                </Form.Group>
            </Modal.Body>
            <Modal.Footer style={{padding: '1rem'}}>
                <Button
                    variant="secondary"
                    style={{backGroundColor: 'secondary'}}
                    size="sm"
                    onClick={handleClose}
                >
                    {t("Close")}
                </Button>
                <Button
                    variant="primary"
                    style={{backGroundColor: 'primary'}}
                    size="sm"
                    onClick={handleSave}
                >
                    {t("Save changes")}
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default UserOptions;