MODULE MainModule
    
    ! You can declare any shared variables here. 
    ! Note: 'Camerahomepos' and 'CameraMechMind' from your waterresistance module 
    ! should either be declared as PERS here or in a separate shared system module.
    LOCAL VAR robtarget hometarget;    

    PROC Main()
        ! 1. Optional Initialization
        ! ConfJ \Off;
        ! SingArea \Wrist;
        
        TPWrite "--- Starting Main Routine ---";
        
        ! 2. Call the Orchestrator procedure from the waterresistance module
        ! This will connect to the PC and start listening for commands
        WROrchestrator;
        
        ! 3. End of program (if WROrchestrator ever exits)
        TPWrite "--- Program Finished ---";
    ENDPROC
    
ENDMODULE
