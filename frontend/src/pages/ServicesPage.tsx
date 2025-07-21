import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, PlusCircle, Trash2, Plus, RotateCcw, Grid, List, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useMarketStore, ServiceType } from '@/store/marketStore';
import ServiceConfigModal from '@/components/market/ServiceConfigModal';
import CustomServiceModal, { CustomServiceData } from '@/components/market/CustomServiceModal';
import BatchImportModal from '@/components/market/BatchImportModal';
import api, { APIResponse } from '@/utils/api';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

export function ServicesPage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { installedServices: globalInstalledServices, fetchInstalledServices, uninstallService, toggleService, checkServiceHealth } = useMarketStore();
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [customServiceModalOpen, setCustomServiceModalOpen] = useState(false);
    const [batchImportModalOpen, setBatchImportModalOpen] = useState(false);
    const [selectedService, setSelectedService] = useState<ServiceType | null>(null);
    const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);
    const [pendingUninstallId, setPendingUninstallId] = useState<string | null>(null);
    const [togglingServices, setTogglingServices] = useState<Set<string>>(new Set());
    const [checkingHealthServices, setCheckingHealthServices] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [autoFillEnv, setAutoFillEnv] = useState('');

    const hasFetched = useRef(false);

    // Check if user is admin (role >= 10)
    const isAdmin = currentUser?.role && currentUser.role >= 10;

    useEffect(() => {
        if (!hasFetched.current) {
            fetchInstalledServices();
            hasFetched.current = true;
        }
    }, [fetchInstalledServices]);

    const allServices = globalInstalledServices;
    const activeServices = globalInstalledServices.filter(s => s.enabled === true);
    const inactiveServices = globalInstalledServices.filter(s => s.enabled === false);

    const handleSaveVar = async (varName: string, value: string) => {
        if (!selectedService) return;
        const service_id = selectedService.id;
        const res = await api.patch('/mcp_market/env_var', {
            service_id,
            var_name: varName,
            var_value: value,
        }) as APIResponse<any>;
        if (res.success) {
            toast({
                title: 'Saved',
                description: `${varName} has been saved.`
            });
            fetchInstalledServices();
        } else {
            throw new Error(res.message || 'Failed to save');
        }
    };

    const handleUninstallClick = (serviceId: string) => {
        setPendingUninstallId(serviceId);
        setUninstallDialogOpen(true);
    };

    const handleUninstallConfirm = async () => {
        if (!pendingUninstallId) return;

        const numericServiceId = parseInt(pendingUninstallId, 10);
        if (isNaN(numericServiceId)) {
            toast({
                title: 'Uninstall Failed',
                description: 'Invalid Service ID format.',
                variant: 'destructive'
            });
            setUninstallDialogOpen(false);
            setPendingUninstallId(null);
            return;
        }

        setUninstallDialogOpen(false);

        try {
            await uninstallService(numericServiceId);
            toast({
                title: 'Uninstall Complete',
                description: 'Service has been successfully uninstalled.'
            });
            fetchInstalledServices();
        } catch (e: any) {
            toast({
                title: 'Uninstall Failed',
                description: e?.message || 'Unknown error',
                variant: 'destructive'
            });
        } finally {
            setPendingUninstallId(null);
        }
    };

    const parseEnvironments = (envStr?: string): Record<string, string> => {
        if (!envStr) return {};
        return envStr.split('\\n').reduce((acc, line) => {
            const [key, ...valueParts] = line.split('=');
            if (key?.trim() && valueParts.length > 0) {
                acc[key.trim()] = valueParts.join('=').trim();
            }
            return acc;
        }, {} as Record<string, string>);
    };

    const handleToggleService = async (serviceId: string) => {
        if (togglingServices.has(serviceId)) {
            return; // Prevent duplicate clicks
        }

        setTogglingServices(prev => new Set(prev).add(serviceId));

        try {
            await toggleService(serviceId);
        } catch (error: any) {
            console.error('Toggle service failed:', error);
        } finally {
            setTogglingServices(prev => {
                const newSet = new Set(prev);
                newSet.delete(serviceId);
                return newSet;
            });
        }
    };

    const handleCheckServiceHealth = async (serviceId: string) => {
        if (checkingHealthServices.has(serviceId)) {
            return; // Prevent duplicate clicks
        }

        setCheckingHealthServices(prev => new Set(prev).add(serviceId));

        try {
            await checkServiceHealth(serviceId);
        } catch (error: any) {
            console.error('Check service health failed:', error);
        } finally {
            setCheckingHealthServices(prev => {
                const newSet = new Set(prev);
                newSet.delete(serviceId);
                return newSet;
            });
        }
    };

    const pollInstallationStatus = async (serviceId: string, serviceName: string) => {
        const maxAttempts = 30; // Maximum 30 polling attempts (about 5 minutes)
        let attempts = 0;

        const poll = async () => {
            try {
                attempts++;
                const response = await api.get(`/mcp_market/install_status/${serviceId}`) as APIResponse<any>;

                if (response.success && response.data) {
                    const status = response.data.status;

                    if (status === 'completed') {
                        toast({
                            title: t('customServiceModal.messages.installationSuccess'),
                            description: t('customServiceModal.messages.installationSuccessDescription', { serviceName })
                        });
                        fetchInstalledServices(); // Refresh list
                        return;
                    } else if (status === 'failed') {
                        toast({
                            title: t('customServiceModal.messages.installationFailed'),
                            description: t('customServiceModal.messages.installationFailedDescription', {
                                serviceName,
                                error: response.data.error || t('customServiceModal.messages.unknownError')
                            }),
                            variant: 'destructive'
                        });
                        return;
                    } else if (status === 'installing' || status === 'pending') {
                        // Continue polling
                        if (attempts < maxAttempts) {
                            setTimeout(poll, 10000); // Check again after 10 seconds
                        } else {
                            toast({
                                title: t('customServiceModal.messages.installationTimeout'),
                                description: t('customServiceModal.messages.installationTimeoutDescription', { serviceName }),
                                variant: 'destructive'
                            });
                        }
                        return;
                    }
                }

                // Continue polling by default
                if (attempts < maxAttempts) {
                    setTimeout(poll, 10000);
                } else {
                    toast({
                        title: t('customServiceModal.messages.statusCheckTimeout'),
                        description: t('customServiceModal.messages.statusCheckTimeoutDescription', { serviceName }),
                        variant: 'destructive'
                    });
                }
            } catch (error: any) {
                console.error('Poll installation status error:', error);
                if (attempts < maxAttempts) {
                    setTimeout(poll, 10000); // Continue trying on error
                } else {
                    toast({
                        title: t('customServiceModal.messages.statusCheckFailed'),
                        description: t('customServiceModal.messages.statusCheckFailedDescription', { serviceName }),
                        variant: 'destructive'
                    });
                }
            }
        };

        // Start polling
        poll();
    };

    const handleCreateCustomService = async (serviceData: CustomServiceData) => {
        try {
            let res;
            if (serviceData.type === 'stdio') {
                let packageName = '';
                let packageManager = '';
                const command = serviceData.command?.trim();

                // Parse arguments and extract package name and custom args
                let customArgs: string[] = [];
                if (serviceData.arguments?.trim()) {
                    // Parse arguments from the arguments field
                    const argLines = serviceData.arguments.trim().split('\n');
                    customArgs = argLines.map(line => line.trim()).filter(line => line.length > 0);

                    // Find package name from arguments (first non-flag argument)
                    const packageNameFromArgs = argLines.find(line => {
                        const trimmedLine = line.trim();
                        return trimmedLine && !trimmedLine.startsWith('-');
                    })?.trim() || '';

                    if (packageNameFromArgs && command === 'npx') {
                        packageManager = 'npm';
                        packageName = packageNameFromArgs;
                    } else if (packageNameFromArgs && command === 'uvx') {
                        packageManager = 'uv';
                        packageName = packageNameFromArgs;
                    }
                } else {
                    // Parse arguments from the command field if no separate arguments
                    const commandParts = command?.split(' ');
                    if (commandParts && commandParts.length > 1) {
                        customArgs = commandParts.slice(1);

                        // Find package name (first non-flag argument)
                        const packageNameFromCommand = commandParts.slice(1).find(part =>
                            part.trim() && !part.trim().startsWith('-')
                        )?.trim() || '';

                        if (packageNameFromCommand && commandParts[0] === 'npx') {
                            packageManager = 'npm';
                            packageName = packageNameFromCommand;
                        } else if (packageNameFromCommand && commandParts[0] === 'uvx') {
                            packageManager = 'uv';
                            packageName = packageNameFromCommand;
                        }
                    }
                }

                if (!packageManager || !packageName) {
                    throw new Error(t('customServiceModal.messages.parseCommandFailed'));
                }

                const payload = {
                    source_type: 'marketplace',
                    package_name: packageName,
                    package_manager: packageManager,
                    display_name: serviceData.name,
                    user_provided_env_vars: parseEnvironments(serviceData.environments),
                    custom_args: customArgs.length > 0 ? customArgs : undefined, // Send custom args if available
                };
                res = await api.post('/mcp_market/install_or_add_service', payload) as APIResponse<any>;

            } else {
                // For 'sse' and 'streamableHttp'
                res = await api.post('/mcp_market/custom_service', serviceData) as APIResponse<any>;
            }

            if (res.success) {
                if (serviceData.type === 'stdio') {
                    // stdio services use install_or_add_service API, need to wait for installation to complete
                    toast({
                        title: t('customServiceModal.messages.installationSubmitted'),
                        description: t('customServiceModal.messages.installationSubmittedDescription', { serviceName: serviceData.name })
                    });

                    // Poll installation status
                    const serviceId = res.data?.mcp_service_id;
                    if (serviceId) {
                        pollInstallationStatus(serviceId, serviceData.name);
                    }
                    // For stdio services, close modal immediately as polling will handle subsequent status
                    setCustomServiceModalOpen(false);
                } else {
                    // sse and streamableHttp services are created directly
                    toast({
                        title: t('customServiceModal.messages.createSuccess'),
                        description: t('customServiceModal.messages.createSuccessDescription', { serviceName: serviceData.name })
                    });
                    // Delay list refresh to wait for service registration to complete
                    setTimeout(async () => {
                        await fetchInstalledServices();
                        // Ensure list refresh is complete before closing modal
                        setCustomServiceModalOpen(false);
                    }, 1000);
                }
                return res.data;
            } else {
                throw new Error(res.message || 'Creation failed');
            }
        } catch (error: any) {
            // Extract the actual error message from the API response
            let errorMessage = t('customServiceModal.messages.unknownError');
            if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            } else if (error.message) {
                errorMessage = error.message;
            }

            toast({
                title: t('customServiceModal.messages.createFailed'),
                description: errorMessage,
                variant: 'destructive'
            });

            // Auto-fill environment variable if missing
            if (error.response?.data?.data?.required_env_vars) {
                const missingEnvs = error.response.data.data.required_env_vars;
                if (missingEnvs.length > 0) {
                    const envVarToSet = `${missingEnvs[0]}=`;
                    setAutoFillEnv(envVarToSet);
                }
            }

            // Re-throw the error so CustomServiceModal can handle its loading state
            throw error;
        }
    };

    // Render list view
    const renderListView = (services: ServiceType[]) => {
        if (services.length === 0) {
            return (
                <div className="text-center py-8 text-muted-foreground">
                    <p>{t('services.noServicesFound')}</p>
                </div>
            );
        }

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t('services.status')}</TableHead>
                        <TableHead>{t('services.serviceName')}</TableHead>
                        <TableHead>{t('services.description')}</TableHead>
                        <TableHead>{t('services.version')}</TableHead>
                        <TableHead>{t('services.healthStatus')}</TableHead>
                        <TableHead>{t('services.enabledStatus')}</TableHead>
                        <TableHead>{t('services.operations')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {services.map(service => (
                        <TableRow key={service.id}>
                            <TableCell>
                                <div className="flex items-center space-x-1">
                                    <div className={`w-2 h-2 rounded-full ${service.health_status === "healthy" || service.health_status === "Healthy"
                                        ? "bg-green-500"
                                        : "bg-gray-400"
                                        }`}></div>
                                    <button
                                        className="p-0.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                                        onClick={() => handleCheckServiceHealth(service.id)}
                                        disabled={checkingHealthServices.has(service.id)}
                                        title={t('services.refreshHealthStatus')}
                                    >
                                        <RotateCcw size={12} className={checkingHealthServices.has(service.id) ? "animate-spin" : ""} />
                                    </button>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="font-medium">{service.display_name || service.name}</div>
                                <div className="text-sm text-muted-foreground">{service.name}</div>
                            </TableCell>
                            <TableCell>
                                <div className="max-w-xs truncate text-sm text-muted-foreground">
                                    {service.description}
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline">{service.version || 'unknown'}</Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant={service.health_status === "healthy" || service.health_status === "Healthy" ? "default" : "secondary"}>
                                    {service.health_status || 'unknown'}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Switch
                                    checked={service.enabled || false}
                                    onCheckedChange={() => handleToggleService(service.id)}
                                    disabled={togglingServices.has(service.id)}
                                />
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center space-x-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => { setSelectedService(service); setConfigModalOpen(true); }}
                                    >
                                        {t('services.configure')}
                                    </Button>
                                    {isAdmin && (
                                        <button
                                            className="p-1 rounded hover:bg-red-100 text-red-500"
                                            onClick={() => handleUninstallClick(service.id)}
                                            title={t('services.uninstallService')}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        );
    };

    // Render grid view
    const renderGridView = (services: ServiceType[]) => {
        if (services.length === 0) {
            return (
                <div className="col-span-3 text-center py-8 text-muted-foreground">
                    <p>{t('services.noServicesFound')}</p>
                </div>
            );
        }

        return services.map(service => (
            <Card key={service.id} className="border-border shadow-sm hover:shadow transition-shadow duration-200 bg-card/30 flex flex-col">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <div className="bg-primary/10 p-2 rounded-md mr-3">
                                <Search className="w-6 h-6 text-primary" />
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="flex items-center space-x-1">
                                    <div className={`w-2 h-2 rounded-full ${service.health_status === "healthy" || service.health_status === "Healthy"
                                        ? "bg-green-500"
                                        : "bg-gray-400"
                                        }`}></div>
                                    <button
                                        className="p-0.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                                        onClick={() => handleCheckServiceHealth(service.id)}
                                        disabled={checkingHealthServices.has(service.id)}
                                        title={t('services.refreshHealthStatus')}
                                    >
                                        <RotateCcw size={12} className={checkingHealthServices.has(service.id) ? "animate-spin" : ""} />
                                    </button>
                                </div>
                                <CardTitle className="text-lg">{service.display_name || service.name}</CardTitle>
                            </div>
                        </div>
                        {isAdmin && (
                            <button
                                className="ml-2 p-1 rounded hover:bg-red-100 text-red-500"
                                onClick={() => handleUninstallClick(service.id)}
                                title={t('services.uninstallService')}
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="flex-grow">
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{service.description}</p>
                    {/* RPD Limit and Usage Display */}
                    {service.rpd_limit !== undefined && service.rpd_limit !== null && service.rpd_limit > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">{t('services.dailyRequests')}:</span>
                                <span className="font-medium">
                                    {service.user_daily_request_count || 0} / {service.rpd_limit}
                                </span>
                            </div>
                            <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                <div
                                    className={`h-1.5 rounded-full transition-all duration-300 ${(service.user_daily_request_count || 0) >= service.rpd_limit
                                        ? 'bg-red-500'
                                        : (service.user_daily_request_count || 0) >= service.rpd_limit * 0.8
                                            ? 'bg-yellow-500'
                                            : 'bg-green-500'
                                        }`}
                                    style={{
                                        width: `${Math.min((service.user_daily_request_count || 0) / service.rpd_limit * 100, 100)}%`
                                    }}
                                ></div>
                            </div>
                            {service.remaining_requests !== undefined && service.remaining_requests >= 0 && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                    {service.remaining_requests} {t('services.requestsRemaining')}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex justify-between items-end mt-auto">
                    <Button variant="outline" size="sm" className="h-6" onClick={() => { setSelectedService(service); setConfigModalOpen(true); }}>{t('services.configure')}</Button>
                    <Switch
                        checked={service.enabled || false}
                        onCheckedChange={() => handleToggleService(service.id)}
                        disabled={togglingServices.has(service.id)}
                    />
                </CardFooter>
            </Card>
        ));
    };

    return (
        <div className="w-full space-y-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{t('services.mcpServices')}</h2>
                    <p className="text-muted-foreground mt-1">{t('services.manageAndConfigure')}</p>
                </div>
                <div className="flex items-center space-x-2">
                    {/* View toggle buttons */}
                    <div className="flex items-center border rounded-md">
                        <Button
                            variant={viewMode === 'grid' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('grid')}
                            className="rounded-r-none"
                        >
                            <Grid className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={viewMode === 'list' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('list')}
                            className="rounded-l-none"
                        >
                            <List className="w-4 h-4" />
                        </Button>
                    </div>

                    {isAdmin && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button className="rounded-full bg-[#7c3aed] hover:bg-[#7c3aed]/90">
                                    <PlusCircle className="w-4 h-4 mr-2" /> {t('services.addService')}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                    setTimeout(() => {
                                        setBatchImportModalOpen(true);
                                    }, 50);
                                }}>
                                    <Upload className="w-4 h-4 mr-2" /> {t('services.batchImport')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate('/market')}>
                                    <Search className="w-4 h-4 mr-2" /> {t('services.installFromMarket')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                    setTimeout(() => {
                                        setCustomServiceModalOpen(true);
                                    }, 50);
                                }}>
                                    <Plus className="w-4 h-4 mr-2" /> {t('services.customInstall')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>

            <Tabs defaultValue="all" className="mb-8">
                <TabsList className="w-full max-w-3xl grid grid-cols-3 bg-muted/80 p-1 rounded-lg">
                    <TabsTrigger value="all" className="rounded-md">{t('services.allServices')}</TabsTrigger>
                    <TabsTrigger value="active" className="rounded-md">{t('services.active')}</TabsTrigger>
                    <TabsTrigger value="inactive" className="rounded-md">{t('services.inactive')}</TabsTrigger>
                </TabsList>
                <TabsContent value="all">
                    {viewMode === 'grid' ? (
                        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mt-6">
                            {renderGridView(allServices)}
                        </div>
                    ) : (
                        <div className="mt-6">
                            {renderListView(allServices)}
                        </div>
                    )}
                </TabsContent>
                <TabsContent value="active">
                    {viewMode === 'grid' ? (
                        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mt-6">
                            {renderGridView(activeServices)}
                        </div>
                    ) : (
                        <div className="mt-6">
                            {renderListView(activeServices)}
                        </div>
                    )}
                </TabsContent>
                <TabsContent value="inactive">
                    {viewMode === 'grid' ? (
                        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mt-6">
                            {renderGridView(inactiveServices)}
                        </div>
                    ) : (
                        <div className="mt-6">
                            {renderListView(inactiveServices)}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {selectedService && (
                <ServiceConfigModal
                    open={configModalOpen}
                    onClose={() => setConfigModalOpen(false)}
                    service={selectedService}
                    onSaveVar={handleSaveVar}
                />
            )}

            <CustomServiceModal
                open={customServiceModalOpen}
                onClose={() => setCustomServiceModalOpen(false)}
                onCreateService={handleCreateCustomService}
                autoFillEnv={autoFillEnv}
                setAutoFillEnv={setAutoFillEnv}
            />

            <BatchImportModal
                open={batchImportModalOpen}
                onClose={() => setBatchImportModalOpen(false)}
                onImportSuccess={() => {
                    fetchInstalledServices();
                    toast({
                        title: t('batchImport.importComplete'),
                        description: t('batchImport.successMessage'),
                        variant: 'default'
                    });
                }}
            />

            <ConfirmDialog
                isOpen={uninstallDialogOpen}
                onOpenChange={setUninstallDialogOpen}
                title={t('services.confirmUninstall')}
                description={t('services.confirmUninstallDescription')}
                confirmText={t('services.uninstall')}
                cancelText={t('services.cancel')}
                onConfirm={handleUninstallConfirm}
                confirmButtonVariant="destructive"
            />
        </div>
    );
} 