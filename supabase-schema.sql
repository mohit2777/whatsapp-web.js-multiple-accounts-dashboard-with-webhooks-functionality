-- Supabase Database Schema for WhatsApp Multi-Automation

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- WhatsApp Accounts Table
CREATE TABLE whatsapp_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'initializing',
    phone_number VARCHAR(50),
    session_dir VARCHAR(500),
    qr_code TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhooks Table
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message Logs Table
CREATE TABLE message_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
    direction VARCHAR(50) NOT NULL, -- 'incoming', 'outgoing', 'webhook', 'webhook_incoming'
    message_id VARCHAR(255),
    sender VARCHAR(255),
    recipient VARCHAR(255),
    message TEXT,
    timestamp BIGINT,
    type VARCHAR(50),
    chat_id VARCHAR(255),
    is_group BOOLEAN DEFAULT false,
    group_name VARCHAR(255),
    media JSONB, -- Store media information as JSON
    status VARCHAR(50) DEFAULT 'success', -- 'success', 'failed'
    error_message TEXT,
    webhook_id UUID REFERENCES webhooks(id),
    webhook_url VARCHAR(500),
    response_status INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_whatsapp_accounts_status ON whatsapp_accounts(status);
CREATE INDEX idx_whatsapp_accounts_created_at ON whatsapp_accounts(created_at);
CREATE INDEX idx_webhooks_account_id ON webhooks(account_id);
CREATE INDEX idx_webhooks_is_active ON webhooks(is_active);
CREATE INDEX idx_message_logs_account_id ON message_logs(account_id);
CREATE INDEX idx_message_logs_direction ON message_logs(direction);
CREATE INDEX idx_message_logs_created_at ON message_logs(created_at);
CREATE INDEX idx_message_logs_status ON message_logs(status);

-- Row Level Security (RLS) Policies
-- Enable RLS on all tables
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- For this application, we'll allow all operations (you can customize based on your needs)
CREATE POLICY "Allow all operations on whatsapp_accounts" ON whatsapp_accounts
    FOR ALL USING (true);

CREATE POLICY "Allow all operations on webhooks" ON webhooks
    FOR ALL USING (true);

CREATE POLICY "Allow all operations on message_logs" ON message_logs
    FOR ALL USING (true);

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_whatsapp_accounts_updated_at 
    BEFORE UPDATE ON whatsapp_accounts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at 
    BEFORE UPDATE ON webhooks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get message statistics
CREATE OR REPLACE FUNCTION get_message_stats(account_uuid UUID)
RETURNS TABLE(
    total BIGINT,
    incoming BIGINT,
    outgoing BIGINT,
    success BIGINT,
    failed BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE direction = 'incoming') as incoming,
        COUNT(*) FILTER (WHERE direction = 'outgoing') as outgoing,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM message_logs
    WHERE account_id = account_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent messages
CREATE OR REPLACE FUNCTION get_recent_messages(account_uuid UUID, limit_count INTEGER DEFAULT 100)
RETURNS TABLE(
    id UUID,
    direction VARCHAR(50),
    message TEXT,
    sender VARCHAR(255),
    recipient VARCHAR(255),
    status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ml.id,
        ml.direction,
        ml.message,
        ml.sender,
        ml.recipient,
        ml.status,
        ml.created_at
    FROM message_logs ml
    WHERE ml.account_id = account_uuid
    ORDER BY ml.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Sample data (optional - for testing)
-- INSERT INTO whatsapp_accounts (name, description, status) VALUES 
-- ('Test Account 1', 'First test account', 'initializing'),
-- ('Test Account 2', 'Second test account', 'initializing');

-- Comments for documentation
COMMENT ON TABLE whatsapp_accounts IS 'Stores WhatsApp account information and status';
COMMENT ON TABLE webhooks IS 'Stores webhook configurations for each account';
COMMENT ON TABLE message_logs IS 'Stores all message activity and webhook delivery logs';
COMMENT ON FUNCTION get_message_stats(UUID) IS 'Returns message statistics for a specific account';
COMMENT ON FUNCTION get_recent_messages(UUID, INTEGER) IS 'Returns recent messages for a specific account'; 