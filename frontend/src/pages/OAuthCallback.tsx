import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import api, { APIResponse } from '@/utils/api';

export function OAuthCallback() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { login: authLogin } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleOAuthCallback = async () => {
            const code = searchParams.get('code');
            const error = searchParams.get('error');
            const provider = window.location.pathname.includes('/oauth/github') ? 'github' : 'google';

            if (error) {
                setError(`OAuth ${provider} authorization failed: ${error}`);
                setLoading(false);
                return;
            }

            if (!code) {
                setError('Missing authorization code');
                setLoading(false);
                return;
            }

            try {
                const endpoint = provider === 'github' ? '/oauth/github' : '/oauth/google';
                const response = await api.get(`${endpoint}?code=${code}`) as APIResponse;

                if (response.success && response.data?.access_token && response.data.user) {
                    // Login successful
                    authLogin(response.data.user, response.data.access_token);

                    if (response.data.refresh_token) {
                        localStorage.setItem('refresh_token', response.data.refresh_token);
                    }

                    toast({
                        title: "Login successful",
                        description: `Welcome! You've logged in via ${provider === 'github' ? 'GitHub' : 'Google'}.`
                    });

                    // Redirect to home page
                    navigate('/', { replace: true });
                } else {
                    setError(response.message || `${provider} OAuth login failed`);
                }
            } catch (error: any) {
                console.error('OAuth callback error:', error);
                setError(error?.response?.data?.message || error.message || `${provider} OAuth login failed`);
            } finally {
                setLoading(false);
            }
        };

        handleOAuthCallback();
    }, [searchParams, navigate, authLogin, toast]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-lg">Processing OAuth login...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center max-w-md">
                    <div className="text-red-500 text-6xl mb-4">⚠️</div>
                    <h1 className="text-2xl font-bold mb-4">OAuth Login Failed</h1>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/login')}
                        className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Return to Login Page
                    </button>
                </div>
            </div>
        );
    }

    return null;
} 